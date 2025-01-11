import {Dispatch, FC, memo, SetStateAction} from "react";

import {IProject} from "@bim/types";

const ProjectItem: FC<Props> = ({project, selectProject, setSelectProject}) => {
  return (
    <div
      className={`group flex justify-between p-1  hover:bg-green-300 hover:text-slate-800 rounded-md my-1
       ${
         selectProject && selectProject.id === project.id
           ? "bg-green-300 text-slate-800"
           : ""
       }
  `}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(project);
        setSelectProject(project);
      }}
    >
      <div className="flex justify-start">
        <p
          className="mx-1 capitalize 
    my-auto select-none 
    whitespace-nowrap overflow-hidden 
    overflow-ellipsis max-w-[200px] p-1 cursor-pointer"
        >
          {project.name}
        </p>
      </div>
    </div>
  );
};
interface Props {
  project: IProject;
  selectProject: IProject | null;
  setSelectProject: Dispatch<SetStateAction<IProject | null>>;
}
export default memo(ProjectItem);
