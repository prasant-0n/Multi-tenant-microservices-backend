export const REDIS_EVENTS = Symbol('REDIS_EVENTS');

export interface TenantCreatedEvent {
  tenantId: string;
  name: string;
  schema: string;
}

export interface UserCreatedEvent {
  tenantId: string;
  userId: string;
  email: string;
}
