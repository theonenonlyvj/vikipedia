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
      await tracking.handlers.abandonRun(
        singleParam(context.params.runId),
        account.accountId,
      ),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
