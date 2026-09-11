import '@fastify/session';

declare module '@fastify/session' {
  interface FastifySessionObject {
    authenticated?: boolean;
  }
}

