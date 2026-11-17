import Box2DFactory from 'box2d-wasm';
import type { BlackHoleZone, StageDef, Zone } from './data/maps';
import type { GravityWell, IPhysics, PhysicsEvent } from './IPhysics';
import type { EntityMotion, EntityRole, EntityShape, MapEntity, MapEntityState } from './types/MapEntity.type';

/** 범퍼가 구슬에 닿은 뒤 번쩍이는 시간 (물리 시간, 초) */
const HIT_FLASH_SEC = 0.22;
/** 블랙홀 안에서 구슬에 거는 감속. 궤도를 돌다 튕겨 나가지 않고 나선을 그리며 빨려 들게 한다 */
const BLACKHOLE_DRAG = 2;
/** 블랙홀이 끌어당기는 힘 대비 옆으로 휘도는 힘의 비율 */
const BLACKHOLE_SWIRL = 0.3;

type EntityRecord = {
  body: Box2D.b2Body;
  x: number;
  y: number;
  shape: EntityShape;
  life: number;
  role: EntityRole;
  /** 움직이는 장애물인지 (위치·각도를 매번 읽어야 하는지) */
  dynamic: boolean;
  /** 구슬이 닿았는지 확인할지 (범퍼) */
  reactive: boolean;
  /** 마지막으로 구슬이 닿은 물리 시각 */
  hitAt: number;
  motion?: EntityMotion;
  baseX: number;
  baseY: number;
};

type ActiveWell = GravityWell & { until: number };

/** 왕복 운동의 진행 정도 (0 = 처음 자세, 1 = 끝까지 간 자세) */
function motionValue(motion: EntityMotion, time: number): number {
  const t = time / motion.period + (motion.phase ?? 0);
  const cycle = t - Math.floor(t);
  if (motion.wave === 'kick') {
    // 주기의 70% 는 가만히 있다가 10% 동안 치고, 20% 동안 돌아온다
    if (cycle < 0.7) return 0;
    if (cycle < 0.8) return smooth((cycle - 0.7) / 0.1);
    return 1 - smooth((cycle - 0.8) / 0.2);
  }
  return (1 - Math.cos(cycle * Math.PI * 2)) / 2;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function roleOf(entity: MapEntity): EntityRole {
  if ((entity.props.life ?? -1) > 0) return 'breakable';
  if (entity.props.restitution > 1) return 'bumper';
  if (entity.type === 'kinematic' && (entity.props.angularVelocity !== 0 || entity.motion)) return 'mover';
  return 'static';
}

export class Box2dPhysics implements IPhysics {
  private Box2D!: typeof Box2D & EmscriptenModule;
  private gravity!: Box2D.b2Vec2;
  private world!: Box2D.b2World;
  /** 매 스텝 힘·속도를 넘길 때 돌려 쓰는 벡터. wasm 객체는 직접 지우지 않으면 쌓이므로 새로 만들지 않는다 */
  private scratch!: Box2D.b2Vec2;

  private marbleMap: { [id: number]: Box2D.b2Body } = {};
  private marbleMass: { [id: number]: number } = {};
  /** 구슬마다 지금 걸려 있는 감속 (SetLinearDamping 호출을 줄이려고 기억한다) */
  private marbleDamping: { [id: number]: number } = {};
  /** 스킬이 건 감속 (번개에 맞은 구슬) */
  private marbleDrag: { [id: number]: number } = {};
  /** 스킬이 건 추진력 (터보) */
  private marbleThrust: { [id: number]: { x: number; y: number } } = {};
  private entities: EntityRecord[] = [];

  private deleteCandidates: Box2D.b2Body[] = [];

  /** 맵을 불러온 뒤 흐른 물리 시간(초). 왕복 운동과 연출의 기준 */
  private time = 0;
  private zones: Zone[] = [];
  private wells: ActiveWell[] = [];
  private events: PhysicsEvent[] = [];

  async init(): Promise<void> {
    this.Box2D = await this.loadBox2D();
    this.gravity = new this.Box2D.b2Vec2(0, 10);
    this.world = new this.Box2D.b2World(this.gravity);
    this.scratch = new this.Box2D.b2Vec2(0, 0);
    console.log('box2d ready');
  }

  /** Node 에서 돌릴 때는 wasm 을 불러오는 방법이 달라 따로 바꿔 끼운다 (scripts/simulate.ts) */
  protected loadBox2D(): Promise<typeof Box2D & EmscriptenModule> {
    return Box2DFactory();
  }

  get elapsed(): number {
    return this.time;
  }

  clear(): void {
    this.clearEntities();
  }

  clearMarbles(): void {
    Object.values(this.marbleMap).forEach((body) => {
      this.world.DestroyBody(body);
    });
    this.marbleMap = {};
    this.marbleMass = {};
    this.marbleDamping = {};
    this.marbleDrag = {};
    this.marbleThrust = {};
    this.wells = [];
    this.events = [];
  }

  createStage(stage: StageDef): void {
    this.time = 0;
    this.zones = stage.zones ?? [];
    this.wells = [];
    this.createEntities(stage.entities);
  }

  createEntities(entities?: MapEntity[]) {
    if (!entities) return;

    const bodyTypes = {
      static: this.Box2D.b2_staticBody,
      kinematic: this.Box2D.b2_kinematicBody,
    } as const;

    entities.forEach((entity) => {
      const bodyDef = new this.Box2D.b2BodyDef();
      bodyDef.set_type(bodyTypes[entity.type]);
      const body = this.world.CreateBody(bodyDef);

      const fixtureDef = new this.Box2D.b2FixtureDef();
      fixtureDef.set_density(entity.props.density);
      fixtureDef.set_restitution(entity.props.restitution);

      let shape;
      switch (entity.shape.type) {
        case 'box':
          shape = new this.Box2D.b2PolygonShape();
          shape.SetAsBox(entity.shape.width, entity.shape.height, 0, entity.shape.rotation);
          fixtureDef.set_shape(shape);
          body.CreateFixture(fixtureDef);
          break;
        case 'polyline':
          shape = new this.Box2D.b2EdgeShape();
          for (let i = 0; i < entity.shape.points.length - 1; i++) {
            const p1 = entity.shape.points[i];
            const p2 = entity.shape.points[i + 1];
            const v1 = new this.Box2D.b2Vec2(p1[0], p1[1]);
            const v2 = new this.Box2D.b2Vec2(p2[0], p2[1]);
            const edge = new this.Box2D.b2EdgeShape();
            edge.SetTwoSided(v1, v2);
            body.CreateFixture(edge, 1);
          }
          break;
        case 'circle':
          shape = new this.Box2D.b2CircleShape();
          shape.set_m_radius(entity.shape.radius);
          fixtureDef.set_shape(shape);
          body.CreateFixture(fixtureDef);
          break;
      }

      const motion = entity.type === 'kinematic' ? entity.motion : undefined;
      body.SetAngularVelocity(motion?.swing !== undefined ? 0 : entity.props.angularVelocity);
      body.SetTransform(new this.Box2D.b2Vec2(entity.position.x, entity.position.y), 0);
      const role = roleOf(entity);
      this.entities.push({
        body,
        x: entity.position.x,
        y: entity.position.y,
        shape: entity.shape,
        life: entity.props.life ?? -1,
        role,
        dynamic: entity.type === 'kinematic',
        reactive: role === 'bumper',
        hitAt: -Infinity,
        motion,
        baseX: entity.position.x,
        baseY: entity.position.y,
      });
    });
  }

  clearEntities() {
    this.entities.forEach((entity) => {
      this.world.DestroyBody(entity.body);
    });
    this.entities = [];
  }

  createMarble(id: number, x: number, y: number): void {
    const circleShape = new this.Box2D.b2CircleShape();
    circleShape.set_m_radius(0.25);

    const bodyDef = new this.Box2D.b2BodyDef();
    bodyDef.set_type(this.Box2D.b2_dynamicBody);
    bodyDef.set_position(new this.Box2D.b2Vec2(x, y));

    const body = this.world.CreateBody(bodyDef);
    body.CreateFixture(circleShape, 1 + Math.random());
    body.SetAwake(false);
    body.SetEnabled(false);
    this.marbleMap[id] = body;
    this.marbleMass[id] = body.GetMass();
  }

  shakeMarble(id: number): void {
    const body = this.marbleMap[id];
    if (body) {
      body.ApplyLinearImpulseToCenter(new this.Box2D.b2Vec2(Math.random() * 10 - 5, Math.random() * 10 - 5), true);
    }
  }

  removeMarble(id: number): void {
    const marble = this.marbleMap[id];
    if (marble) {
      this.world.DestroyBody(marble);
      delete this.marbleMap[id];
      delete this.marbleMass[id];
      delete this.marbleDamping[id];
      delete this.marbleDrag[id];
      delete this.marbleThrust[id];
    }
  }

  getMarblePosition(id: number): { x: number; y: number; angle: number } {
    const marble = this.marbleMap[id];
    if (marble) {
      const pos = marble.GetPosition();
      return { x: pos.x, y: pos.y, angle: marble.GetAngle() };
    } else {
      return { x: 0, y: 0, angle: 0 };
    }
  }

  getMarbleVelocity(id: number): { x: number; y: number } {
    const marble = this.marbleMap[id];
    if (!marble) return { x: 0, y: 0 };
    const v = marble.GetLinearVelocity();
    return { x: v.x, y: v.y };
  }

  getEntities(): MapEntityState[] {
    return this.entities.map((entity) => {
      if (entity.motion?.slide) {
        const pos = entity.body.GetPosition();
        entity.x = pos.x;
        entity.y = pos.y;
      }
      return {
        x: entity.x,
        y: entity.y,
        angle: entity.dynamic ? entity.body.GetAngle() : 0,
        shape: entity.shape,
        life: entity.life,
        role: entity.role,
        hit: entity.reactive ? Math.max(0, 1 - (this.time - entity.hitAt) / HIT_FLASH_SEC) : 0,
      };
    });
  }

  impact(id: number): void {
    const src = this.marbleMap[id];
    if (!src) return;

    Object.values(this.marbleMap).forEach((body) => {
      if (body === src) return;

      const distVector = new this.Box2D.b2Vec2(body.GetPosition().x, body.GetPosition().y);
      distVector.op_sub(src.GetPosition());
      const distSq = distVector.LengthSquared();

      if (distSq < 100) {
        distVector.Normalize();
        const power = 1 - distVector.Length() / 10;
        distVector.op_mul(power * power * 5);
        body.ApplyLinearImpulseToCenter(distVector, true);
      }
    });
  }

  setMarbleDrag(id: number, drag: number): void {
    if (drag > 0) this.marbleDrag[id] = drag;
    else delete this.marbleDrag[id];
  }

  setMarbleThrust(id: number, ax: number, ay: number): void {
    if (ax === 0 && ay === 0) delete this.marbleThrust[id];
    else this.marbleThrust[id] = { x: ax, y: ay };
  }

  nudgeMarble(id: number, vx: number, vy: number): void {
    const body = this.marbleMap[id];
    if (!body) return;
    const mass = this.marbleMass[id] ?? 1;
    this.scratch.Set(vx * mass, vy * mass);
    body.ApplyLinearImpulseToCenter(this.scratch, true);
  }

  swapMarbles(a: number, b: number): void {
    const bodyA = this.marbleMap[a];
    const bodyB = this.marbleMap[b];
    if (!bodyA || !bodyB) return;
    const pa = bodyA.GetPosition();
    const pb = bodyB.GetPosition();
    const ax = pa.x;
    const ay = pa.y;
    const bx = pb.x;
    const by = pb.y;
    const va = bodyA.GetLinearVelocity();
    const vb = bodyB.GetLinearVelocity();
    const vax = va.x;
    const vay = va.y;
    const vbx = vb.x;
    const vby = vb.y;
    this.scratch.Set(bx, by);
    bodyA.SetTransform(this.scratch, bodyA.GetAngle());
    this.scratch.Set(vbx, vby);
    bodyA.SetLinearVelocity(this.scratch);
    this.scratch.Set(ax, ay);
    bodyB.SetTransform(this.scratch, bodyB.GetAngle());
    this.scratch.Set(vax, vay);
    bodyB.SetLinearVelocity(this.scratch);
    bodyA.SetAwake(true);
    bodyB.SetAwake(true);
  }

  addGravityWell(well: GravityWell): void {
    this.wells.push({ ...well, until: this.time + well.duration });
  }

  drainEvents(): PhysicsEvent[] {
    if (this.events.length === 0) return this.events;
    const events = this.events;
    this.events = [];
    return events;
  }

  start(): void {
    for (const key in this.marbleMap) {
      const marble = this.marbleMap[key];
      marble.SetAwake(true);
      marble.SetEnabled(true);
    }
  }

  // contact 목록에는 AABB만 겹친 contact도 섞여 있고, 새 contact가 맨 앞에 붙으므로 전체를 순회해야 한다.
  private isTouchingAny(body: Box2D.b2Body): boolean {
    const { getPointer } = this.Box2D;
    for (let edge = body.GetContactList(); getPointer(edge) !== 0; edge = edge.next) {
      if (edge.contact.IsTouching()) return true;
    }
    return false;
  }

  /** 왕복 운동하는 장애물이 다음 스텝 끝에 있어야 할 자리로 가도록 속도를 맞춘다 */
  private driveMovers(deltaSeconds: number) {
    for (const entity of this.entities) {
      const motion = entity.motion;
      if (!motion) continue;
      const u = motionValue(motion, this.time + deltaSeconds);
      if (motion.slide) {
        const pos = entity.body.GetPosition();
        this.scratch.Set(
          (entity.baseX + motion.slide[0] * u - pos.x) / deltaSeconds,
          (entity.baseY + motion.slide[1] * u - pos.y) / deltaSeconds
        );
        entity.body.SetLinearVelocity(this.scratch);
      }
      if (motion.swing !== undefined) {
        entity.body.SetAngularVelocity((motion.swing * u - entity.body.GetAngle()) / deltaSeconds);
      }
    }
  }

  /** 효과 구역, 스킬이 건 힘과 감속을 구슬마다 적용한다 */
  private applyFields() {
    if (this.wells.length > 0) this.wells = this.wells.filter((well) => well.until > this.time);
    const zones = this.zones;
    const wells = this.wells;
    const hasSkillEffects = Object.keys(this.marbleDrag).length > 0 || Object.keys(this.marbleThrust).length > 0;
    if (zones.length === 0 && wells.length === 0 && !hasSkillEffects && Object.keys(this.marbleDamping).length === 0) {
      return;
    }

    for (const key in this.marbleMap) {
      const id = Number(key);
      const body = this.marbleMap[id];
      if (!body.IsEnabled()) continue;
      const pos = body.GetPosition();
      const x = pos.x;
      const y = pos.y;
      let ax = 0;
      let ay = 0;
      let drag = this.marbleDrag[id] ?? 0;
      let swallowedBy: BlackHoleZone | null = null;

      for (const zone of zones) {
        if (zone.type === 'blackhole') {
          const dx = zone.x - x;
          const dy = zone.y - y;
          const dist = Math.hypot(dx, dy);
          if (dist >= zone.radius) continue;
          if (dist <= zone.core) {
            swallowedBy = zone;
            break;
          }
          const pull = (zone.strength * (1 - dist / zone.radius)) / dist;
          ax += (dx - dy * BLACKHOLE_SWIRL) * pull;
          ay += (dy + dx * BLACKHOLE_SWIRL) * pull;
          drag = Math.max(drag, BLACKHOLE_DRAG);
        } else if (Math.abs(x - zone.x) <= zone.w / 2 && Math.abs(y - zone.y) <= zone.h / 2) {
          if (zone.type === 'force') {
            ax += zone.force[0];
            ay += zone.force[1];
          } else {
            drag = Math.max(drag, zone.drag);
          }
        }
      }

      if (swallowedBy) {
        this.warp(id, body, swallowedBy, x, y);
        continue;
      }

      for (const well of wells) {
        if (well.immune === id) continue;
        const dx = well.x - x;
        const dy = well.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist >= well.radius || dist < 0.05) continue;
        const pull = (well.strength * (1 - dist / well.radius)) / dist;
        ax += (dx - dy * BLACKHOLE_SWIRL) * pull;
        ay += (dy + dx * BLACKHOLE_SWIRL) * pull;
        drag = Math.max(drag, BLACKHOLE_DRAG);
      }

      const thrust = this.marbleThrust[id];
      if (thrust) {
        ax += thrust.x;
        ay += thrust.y;
      }

      if (ax !== 0 || ay !== 0) {
        const mass = this.marbleMass[id] ?? 1;
        this.scratch.Set(ax * mass, ay * mass);
        body.ApplyForceToCenter(this.scratch, true);
      }
      if ((this.marbleDamping[id] ?? 0) !== drag) {
        body.SetLinearDamping(drag);
        if (drag > 0) this.marbleDamping[id] = drag;
        else delete this.marbleDamping[id];
      }
    }
  }

  /** 블랙홀이 삼킨 구슬을 화이트홀 중 한 곳으로 내보낸다 */
  private warp(id: number, body: Box2D.b2Body, zone: BlackHoleZone, x: number, y: number) {
    const exits = zone.exits;
    if (exits.length === 0) return;
    let pick = Math.random() * exits.reduce((sum, exit) => sum + (exit.weight ?? 1), 0);
    let exit = exits[exits.length - 1];
    for (const candidate of exits) {
      pick -= candidate.weight ?? 1;
      if (pick < 0) {
        exit = candidate;
        break;
      }
    }
    // 여러 구슬이 한꺼번에 나와도 겹치지 않게 조금씩 흩뜨린다
    const toX = exit.x + (Math.random() - 0.5) * 0.6;
    const toY = exit.y + (Math.random() - 0.5) * 0.6;
    this.scratch.Set(toX, toY);
    body.SetTransform(this.scratch, body.GetAngle());
    this.scratch.Set((exit.velocity?.[0] ?? 0) + (Math.random() - 0.5) * 2, (exit.velocity?.[1] ?? 0) + Math.random());
    body.SetLinearVelocity(this.scratch);
    body.SetAwake(true);
    this.events.push({ type: 'warp', id, from: { x, y }, to: { x: toX, y: toY } });
  }

  step(deltaSeconds: number): void {
    this.deleteCandidates.forEach((body) => {
      this.world.DestroyBody(body);
    });
    this.deleteCandidates = [];

    if (deltaSeconds > 0) this.driveMovers(deltaSeconds);
    this.applyFields();

    this.world.Step(deltaSeconds, 6, 2);
    this.time += deltaSeconds;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      if (entity.life > 0) {
        if (this.isTouchingAny(entity.body)) {
          this.deleteCandidates.push(entity.body);
          this.entities.splice(i, 1);
          this.events.push({ type: 'break', x: entity.x, y: entity.y, color: entity.shape.color });
        }
      } else if (entity.reactive && this.isTouchingAny(entity.body)) {
        entity.hitAt = this.time;
      }
    }
  }
}
