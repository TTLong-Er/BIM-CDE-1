import {IProject} from "@bim/types";
import {signal} from "@preact/signals-react";

export const projectSignal = signal<IProject[] | null>(null);
