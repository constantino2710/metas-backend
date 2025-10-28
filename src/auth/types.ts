/* eslint-disable prettier/prettier */

export enum Role {
  ADMIN = 'ADMIN',
  CLIENT_ADMIN = 'CLIENT_ADMIN',
  STORE_MANAGER = 'STORE_MANAGER',
  // adicione outros papéis se necessário
}

export type JwtUser = {
  id: string;                 // id do usuário (nunca undefined)
  role: Role;                 // papel tipado pelo enum
  clientId?: string | null;   // pode ser null se não tiver cliente vinculado
  storeId?: string | null;    // pode ser null se não tiver loja vinculada
  iat?: number;
  exp?: number;
};
