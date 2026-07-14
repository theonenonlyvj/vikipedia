import {
  createTrackingContext,
  singleParam,
  type Env,
} from "../../../_shared/createTrackingContext";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    const account = await tracking.authorize(context.request);
    return tracking.json(
      await tracking.handlers.completeRun(
        singleParam(context.params.runId),
        account.accountId,
        (await tracking.readJson(context.request)) as {
          finalTitle: string;
          clientTimestampMs?: number;
        },
      ),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
