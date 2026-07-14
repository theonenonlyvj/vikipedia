import { createTrackingContext, type Env } from "../../_shared/createTrackingContext";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    return tracking.json(
      await tracking.identity.login(
        (await tracking.readJson(context.request)) as {
          deviceCredential: string;
          username: string;
          password: string;
        },
      ),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
