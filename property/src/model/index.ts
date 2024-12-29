import {NextFunction, Request, Response, Router} from "express";
import {Properties} from "./properties";

const route = Router();
route.post("", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chunk: any[] = req.body;
    Properties.insertMany(chunk);
    return res.status(200).json("Success");
  } catch (error) {
    next(error);
  }
});
route.get(
  "/:modelId/properties/:name",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {modelId, name} = req.params;
      if (!modelId || !name)
        return next({
          statusCode: 403,
          message: "Missing params",
        });
      if (typeof modelId !== "string" || typeof name !== "string")
        return next({
          statusCode: 403,
          message: "Wrong data type",
        });
      const props = await Properties.findOne({modelId, name});
      return res.status(200).json(props?.data);
    } catch (error) {
      next(error);
    }
  }
);
export default route;
