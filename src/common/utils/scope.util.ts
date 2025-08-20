/* eslint-disable prettier/prettier */
import { JwtUser } from '../../auth/types';
type Where = Record<string, any>;

export function applyScope(user: JwtUser, where: Where = {}): Where {
  if (user.role === 'ADMIN') return where;
  if (user.role === 'CLIENT_ADMIN') return { ...where, clientId: user.clientId };
  if (user.role === 'STORE_MANAGER') {
    const w: Record<string, any> = { ...where, storeId: user.storeId };
    if (user.clientId) w.clientId = user.clientId;
    return w;
  }
  return where;
}
