import {Router} from "express";

import {modelController} from "../../../controller";

const route = Router();
route.post("", modelController.create);
route.delete("", modelController.delete);
route.put("", modelController.update);
export default route;
