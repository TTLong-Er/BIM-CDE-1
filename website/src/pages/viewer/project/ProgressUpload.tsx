import {FC, memo} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Progress} from "@/components/ui/progress";
import {Label} from "@/components/ui/label";

const ProgressUpload: FC<Props> = ({openNewModel, progress}) => {
  return (
    <Dialog open={openNewModel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upload progress!</DialogTitle>
        </DialogHeader>
        <div className="flex start items-center gap-4 pr-10">
          <Progress value={progress} />
          <Label className="text-right w-[15%]">{`${progress.toFixed(
            0
          )}%`}</Label>
        </div>
      </DialogContent>
    </Dialog>
  );
};
interface Props {
  openNewModel: boolean;
  progress: number;
}
export default memo(ProgressUpload);
