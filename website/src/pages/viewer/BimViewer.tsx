import {useEffect, useRef, useState} from "react";
import LeftPanel from "./bim/LeftPanel";
import {BimModel} from "@bim/BimModel";
import {useSignals} from "@preact/signals-react/runtime";

import Spinner from "@components/Spinner/Spinner";
import NotifyProgress from "@components/Notify/NotifyProgress";
import {useNavigate} from "react-router";
import {useSearchParams} from "react-router-dom";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  fileLoaderSignal,
  geometryLoaderSignal,
  propertyLoaderSignal,
  bimRouteSignal,
  projectSignal,
  modelLoadedSignal,
} from "@bim/signals";

import * as BUI from "@thatopen/ui";
import {useAuth} from "@clerk/clerk-react";
import {setNotify} from "@components/Notify/baseNotify";
/**
 *
 * @returns
 */
const BimViewer = () => {
  useSignals();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelId = searchParams.get("modelId");
  const projectId = searchParams.get("projectId");

  const [bimModel, setBimModel] = useState<BimModel | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!projectId || !modelId || !projectSignal.value) {
      navigate("/Error");
      return;
    }
    const project = projectSignal.value.find((pro) => pro.id === projectId);
    if (!project) {
      navigate("/Error");
      return;
    }

    BUI.Manager.init();
    const model = new BimModel(containerRef.current);
    containerRef.current.appendChild(model.selectionPanel);
    bimRouteSignal.value = true;
    (async () => {
      await model.loadModelFromServer(modelId, projectId);
    })();
    setBimModel(model);
    setTimeout(model.onResize, 1);

    return () => {
      model?.dispose();
      setBimModel(null);
    };
  }, [modelId, projectId]);

  const onResize = () => {
    if (!bimModel) return;
    setTimeout(bimModel.onResize, 1);
  };

  return (
    <>
      <ResizablePanelGroup
        direction="horizontal"
        className="relative h-full w-full overflow-hidden"
        onLayout={onResize}
      >
        <ResizablePanel
          defaultSize={15}
          maxSize={20}
          minSize={10}
          className="relative h-full p-2"
        >
          {/* {bimModel && (
            <LeftPanel
              bimModel={bimModel}
              isPreview={isPreview}
              handleOpenFile={handleOpenFile}
            />
          )} */}
        </ResizablePanel>
        <ResizableHandle className="w-[4px]" />

        <ResizablePanel>
          <div
            className="relative h-full w-full exclude-theme-change"
            ref={containerRef}
          >
            <Spinner />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <NotifyProgress name="File" signal={fileLoaderSignal} />
      <NotifyProgress name="Geometry" signal={geometryLoaderSignal} />
      <NotifyProgress name="Property" signal={propertyLoaderSignal} />
    </>
  );
};

export default BimViewer;
