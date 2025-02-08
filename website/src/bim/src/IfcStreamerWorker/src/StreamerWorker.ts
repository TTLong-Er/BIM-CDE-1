import {OffScreen} from "./OffScreen";
import {
  IAddFragments,
  ICameraData,
  ICullingUpdate,
  ILoadModel,
  IOffScreenCanvasConfig,
  IStreamerWorker,
} from "./types";

let offscreen!: OffScreen;
/**
 *
 * @param payload
 */
const onInit = (payload: IOffScreenCanvasConfig) => {
  if (!offscreen) {
    offscreen = new OffScreen(
      payload,
      (data: ICullingUpdate) => {
        self.postMessage({
          action: "onUpdateCuller",
          payload: data,
        } as IStreamerWorker);
      },
      (fragments: IAddFragments) => {
        self.postMessage({
          action: "onAddFragments",
          payload: fragments,
        } as IStreamerWorker);
      }
    );
  }
};
/**
 *
 * @param payload
 */
const onUpdateCamera = (payload: ICameraData) => {
  if (!offscreen) return;

  offscreen.updateCamera(payload);
};
/**
 *
 * @param payload
 */
const onLoadModel = async (payload: ILoadModel) => {
  if (!offscreen) return;
  await offscreen.onLoadModel(payload);
};

/**
 *
 */
const handlerMap = {
  onInit,
  onUpdateCamera,
  onLoadModel,
};
self.onmessage = async (event: MessageEvent) => {
  const {action, payload} = event.data as IStreamerWorker;
  const handler = handlerMap[action as keyof typeof handlerMap];
  if (handler) handler(payload);
};
