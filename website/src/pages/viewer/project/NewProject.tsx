import React, {Dispatch, FC, SetStateAction, useId, useState} from "react";
import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useAuth} from "@clerk/clerk-react";
import {newProject} from "@api/project";
import {setNotify} from "@components/Notify/baseNotify";
import {projectSignal} from "@bim/signals/project";
import {IProject} from "@bim/types";
const NewProject: FC<Props> = ({openNewProject, setOpenNewProject}) => {
  const {getToken} = useAuth();
  const nameId = useId();
  const addressId = useId();
  const [projectName, setProjectName] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const handleNewProject = async () => {
    try {
      const token = await getToken();
      const res = await newProject(token!, {projectName, address});
      projectSignal.value = res.data.projects.map((pro) => ({
        id: pro.id,
        name: pro.name,
        createAt: pro.createAt,
        models: pro.models ?? [],
      })) as IProject[];

      setProjectName("");
      setAddress("");
      setOpenNewProject(false);
    } catch (error: any) {
      setNotify(error.message, false);
    }
  };
  return (
    <Dialog
      open={openNewProject}
      onOpenChange={(open: boolean) => setOpenNewProject(open)}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={nameId} className="text-right">
              Name
            </Label>
            <Input
              required
              id={nameId}
              value={projectName}
              className="col-span-3"
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={addressId} className="text-right">
              Address
            </Label>
            <Input
              required
              id={addressId}
              value={address}
              className="col-span-3"
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={projectName === ""}
            onClick={handleNewProject}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface Props {
  openNewProject: boolean;
  setOpenNewProject: Dispatch<SetStateAction<boolean>>;
}
export default NewProject;
