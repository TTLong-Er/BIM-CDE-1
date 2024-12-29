import {ZodError, z} from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string(),
  MONGO_HOST: z.string(),
  MONGO_PORT: z.string(),
});
try {
  EnvSchema.parse(process.env);
} catch (error) {
  if (error instanceof ZodError) {
    let message = "Missing required values in .env:\n";
    error.issues.forEach((issue) => {
      message += issue.path[0] + "\n";
    });
    const e = new Error(message);
    e.stack = "";
    throw e;
  } else {
    console.error(error);
  }
}

export default EnvSchema.parse(process.env);
