"use client";

import {memo} from "react";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {BimModel} from "@bim/BimModel";
import LoadModel from "./LoadModel";
import {useSignals} from "@preact/signals-react/runtime";
import Settings from "./Settings";
import {modelLoadedSignal} from "@bim/signals";
import ModelCoord from "./ModelCoord";

const LeftPanel = ({
  bimModel,
  isPreview,
  handleOpenFile,
}: {
  bimModel: BimModel;
  isPreview: boolean;
  handleOpenFile: () => void;
}) => {
  useSignals();

  return (
    <Tabs defaultValue={"project"} className="w-full h-full">
      <TabsList className={`grid w-full grid-cols-2`}>
        <TabsTrigger value="project">Project</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent
        value="project"
        className="relative h-[calc(100%-40px)] w-full overflow-hidden"
      >
        {isPreview && (
          <LoadModel
            loaded={modelLoadedSignal.value}
            handleOpenFile={handleOpenFile}
          />
        )}
        {isPreview && <ModelCoord />}
      </TabsContent>
      <TabsContent
        value="settings"
        className="relative h-[calc(100%-40px)] w-full overflow-hidden"
      >
        <Settings />
      </TabsContent>
    </Tabs>
  );
};

export default memo(LeftPanel);
