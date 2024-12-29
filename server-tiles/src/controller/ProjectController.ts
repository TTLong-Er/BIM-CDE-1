import {Request, Response, NextFunction} from "express";
import {projects} from "../db/schema";
import {BaseController} from "./BaseController";
import {configRedis, db, redisClient} from "../db";
import {forbidden} from "../config/ErrorHandler";
import {eq} from "drizzle-orm";
import {WithAuthProp} from "@clerk/clerk-sdk-node";
import {awsClient} from "../config/AWS3";
import {v4 as uuidv4} from "uuid";
import webpush from "web-push";

export const getUserInfo = async (userId: string) => {
  return await db.query.projects.findMany({
    where: eq(projects.userId, userId),
    with: {
      models: true,
    },
  });
};
/**
 *
 */
export class ProjectController extends BaseController<
  typeof projects.$inferInsert
> {
  /**
   *
   * @returns
   */
  private async createBucket() {
    try {
      const projectId = uuidv4();
      const params: AWS.S3.CreateBucketRequest = {
        Bucket: projectId,
        ACL: "public-read-write",
      };
      const cors = {
        Bucket: projectId,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedMethods: ["GET"],
              AllowedOrigins: ["*"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["*"],
              MaxAgeSeconds: 300,
            },
          ],
        },
      };
      await awsClient.createBucket(params).promise();
      await awsClient.putBucketCors(cors).promise();
      return projectId;
    } catch (error) {
      return null;
    }
  }
  /**
   *
   * @param req
   * @param res
   * @param next
   * @returns
   */
  create = async (
    req: WithAuthProp<Request>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {userId} = req.auth;

      const {projectName, address} = req.body;

      if (!projectName || !address || !userId)
        return next(forbidden("Missing Project name or address"));

      const projectId = await this.createBucket();

      if (!projectId) return next(forbidden("Can not create project"));

      await this.db
        .insert(projects)
        .values({id: projectId, name: projectName, address, userId})
        .returning({id: projects.id});

      const userProjects = await getUserInfo(userId);

      await redisClient.set(userId, JSON.stringify(userProjects), configRedis);

      res.status(200).json({projects: userProjects});
    } catch (error: any) {
      console.log(error);
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   * @returns
   */
  read = async (
    req: WithAuthProp<Request>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const {userId} = req.auth;
      if (!userId) {
        next({statusCode: 403, message: "Unauthorized!"});
        return;
      }
      const data = await redisClient.get(userId);
      if (!data) {
        const userProjects = await getUserInfo(userId);
        await redisClient.set(
          userId,
          JSON.stringify(userProjects),
          configRedis
        );
        res.status(200).json({projects: userProjects});
        return;
      }
      res.status(200).json({projects: JSON.parse(data)});
    } catch (error) {
      console.log(error);
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  update = async (req: Request, res: Response, next: NextFunction) => {};
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  bulkInsert = async (req: Request, res: Response, next: NextFunction) => {
    try {
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {id} = req.params;
      res.status(200).json({
        id,
      });
    } catch (error: any) {
      next(error);
    }
  };
  /**
   *
   * @param req
   * @param res
   * @param next
   */
  findByDynamicQuery = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
    } catch (error: any) {
      next(error);
    }
  };
}
export const projectController = new ProjectController(db);
