import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@components/ui/button";
import NewProject from "./project/NewProject";
import {useEffect, useRef, useState} from "react";
import ProjectContent from "./project/ProjectContent";
import {isBrowser} from "@constants/browser";
import {IProject} from "@bim/types";
import {derivativeFile} from "@api/project";
import {useAuth} from "@clerk/clerk-react";
import {setNotify} from "@components/Notify/baseNotify";
import {AxiosProgressEvent} from "axios";
import ProgressUpload from "./project/ProgressUpload";
import {Socket, io} from "socket.io-client";
import {socketUrl} from "@api/core";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import ProjectTable from "./project/ProjectTable";
import {projectSignal} from "@bim/signals";
import {useSignals} from "@preact/signals-react/runtime";

/**
 *
 * @returns
 */
const ProjectViewer = () => {
  useSignals();
  const {getToken, userId} = useAuth();

  const socketRef = useRef<Socket | null>(null);

  const [openNewProject, setOpenNewProject] = useState<boolean>(false);

  const [openNewModel, setOpenNewModel] = useState<boolean>(false);

  const [progress, setProgress] = useState<number>(0);

  const [selectProject, setSelectProject] = useState<IProject | null>(null);

  const onUploadProgress = (progressEvent: AxiosProgressEvent) => {
    const {total, loaded} = progressEvent;
    if (!total) return;
    setProgress((loaded * 100) / total);
    if (loaded === total) setOpenNewModel(false);
  };
  const onUploadServer = async () => {
    if (!selectProject) return;

    if (!userId) {
      setNotify("UnAuthorization!", false);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc, .IFC, .dxf";
    input.multiple = false;
    input.click();
    input.onchange = async (e: any) => {
      const file = e.target.files[0] as File;
      if (!file) return;
      setOpenNewModel(true);
      setProgress(0);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await derivativeFile(file, selectProject.id, userId, onUploadProgress);
      } catch (error: any) {
        setNotify(error.message, false);
        setOpenNewModel(false);
        setProgress(0);
      }
    };
    input.remove();
  };
  const onShare = () => {
    if (!selectProject) return;
    if (!isBrowser) return;
    const protocol = window.location.protocol;
    const host = window.location.host;
    window.navigator.clipboard
      .writeText(
        `${protocol}//${host}/viewer/bim?projectId=${selectProject.id}&private=false`
      )
      .then(() => {
        console.log("Text copied to clipboard");
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  };
  const handleUpdateModel = (project: any) => {
    if (!projectSignal.value) return;
    projectSignal.value = projectSignal.value.map((pro) => {
      if (pro.id === project.id) {
        setSelectProject(project);
        return project;
      } else return pro;
    }) as IProject[];
  };
  /**
   *
   */
  useEffect(() => {
    if (!userId) return;
    socketRef.current = io(socketUrl, {
      auth: {credential: userId, type: "project"},
    });
    socketRef.current.on("update-model", handleUpdateModel);
    return () => {
      socketRef.current!.off("update-model", handleUpdateModel);

      socketRef.current!.disconnect();
    };
  }, []);
  return (
    <>
      <div className="relative h-full w-full overflow-hidden flex items-center p-5 bg-orange-300">
        <Card className="relative h-full w-full overflow-hidden shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle>
              <div className="w-full flex justify-between">
                <h1 className="my-auto">My Document</h1>
                <div className="flex justify-end gap-2">
                  <Button
                    variant={"destructive"}
                    onClick={() => {
                      setOpenNewProject(true);
                    }}
                  >
                    New Project
                  </Button>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative h-full w-full ">
            <ResizablePanelGroup
              direction="horizontal"
              className="relative h-full w-full overflow-hidden"
            >
              <ResizablePanel
                defaultSize={15}
                maxSize={25}
                className="relative h-full p-2"
              >
                <ProjectContent
                  selectProject={selectProject}
                  setSelectProject={setSelectProject}
                />
              </ResizablePanel>
              <ResizableHandle className="w-[4px]" />
              <ResizablePanel defaultSize={85}>
                {selectProject && (
                  <ProjectTable
                    selectProject={selectProject}
                    onUploadServer={onUploadServer}
                    onShare={onShare}
                  />
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </CardContent>
        </Card>
      </div>
      <NewProject
        openNewProject={openNewProject}
        setOpenNewProject={setOpenNewProject}
      />
      <ProgressUpload openNewModel={openNewModel} progress={progress} />
    </>
  );
};

export default ProjectViewer;
