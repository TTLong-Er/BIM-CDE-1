import {Router} from "express";
import {Parser} from "./parser";

const route = Router();
route.post("/derivative", Parser.ifcParser);
export default route;
