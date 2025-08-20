export type JwtUser = {
  sub: string;
  email: string;
  role: 'ADMIN' | 'CLIENT_ADMIN' | 'STORE_MANAGER';
  clientId?: string;
  storeId?: string;
  iat?: number;
  exp?: number;
};
