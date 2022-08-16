import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import { DefaultErrorShape, initTRPC } from '../src';
import { DefaultErrorData } from '../src/error/formatter';

describe('no custom error formatter', () => {
  const t = initTRPC()();

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);
      const client = opts.client;

      return {
        close: opts.close,
        client,
        proxy: opts.proxy,
      };
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  function isTRPCClientError(
    cause: unknown,
  ): cause is TRPCClientError<typeof appRouter> {
    if (cause instanceof TRPCClientError) {
      return true;
    }
    return false;
  }

  test('infer errors with type guard', async () => {
    const err = await waitError(ctx.proxy.greeting.query());

    if (!isTRPCClientError(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
  });
});

describe('with custom error formatter', () => {
  const t = initTRPC()({
    errorFormatter({ shape }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  function isTRPCClientError(
    cause: unknown,
  ): cause is TRPCClientError<typeof appRouter> {
    if (cause instanceof TRPCClientError) {
      return true;
    }
    return false;
  }

  test('infer errors with type guard', async () => {
    const err = await waitError(ctx.proxy.greeting.query());

    if (!isTRPCClientError(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();

    err.data!.stack = '[redacted]';

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "foo": "bar",
        "httpStatus": 500,
        "path": "greeting",
        "stack": "[redacted]",
      }
    `);
    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32603,
        "data": Object {
          "code": "INTERNAL_SERVER_ERROR",
          "foo": "bar",
          "httpStatus": 500,
          "path": "greeting",
          "stack": "[redacted]",
        },
        "message": "Fails",
      }
    `);
  });
});