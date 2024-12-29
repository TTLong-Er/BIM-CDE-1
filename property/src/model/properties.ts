import mongoose, {Schema, model} from "mongoose";
import env from "../config/env";
export interface IProperties {
  modelId: string;
  name: string;
  data: any;
}

const propertySchema = new Schema<IProperties>({
  name: {type: String, required: true, index: true},
  modelId: {type: String, required: true, index: true},
  data: {type: Object, required: true},
});

export const Properties = model<IProperties>("Properties", propertySchema);
/**
 *
 */
export const dbConnect = async () => {
  await mongoose.connect(
    `mongodb://${env.MONGO_HOST}:${env.MONGO_PORT}/bimtiles`,
    {connectTimeoutMS: 3000}
  );
  console.log("Mongo connected!");
};
