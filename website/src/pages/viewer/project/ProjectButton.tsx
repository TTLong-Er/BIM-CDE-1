import React, {FC, memo, ReactElement} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {Button} from "@components/ui/button";
const ProjectButton: FC<IProjectButton> = ({tooltip, icon, onClick}) => {
  return (
    <TooltipProvider delayDuration={10}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={"secondary"} onClick={onClick}>
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export interface IProjectButton {
  tooltip: string;
  icon: ReactElement;
  onClick: () => void;
}

export default memo(ProjectButton);
