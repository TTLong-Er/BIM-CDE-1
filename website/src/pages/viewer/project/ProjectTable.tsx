"use client";

import {ReactElement, useState} from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {ArrowUpDown, ChevronDown, SquareDashedKanban, View} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Input} from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {IModel, IProject} from "@bim/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ProjectButton, {IProjectButton} from "./ProjectButton";
import {IoCloudUploadOutline} from "react-icons/io5";
import {FaShareFromSquare} from "react-icons/fa6";
import {useNavigate} from "react-router";

const RowViewer = ({
  model,
  icon,
  tooltip,
}: {
  model: IModel;
  icon: ReactElement;
  tooltip: "bim" | "analyze";
}) => {
  const navigate = useNavigate();
  const {id, projectId} = model;
  const handleClick = () => {
    const url = `/viewer/${tooltip}?projectId=${projectId}&modelId=${id}`;
    navigate(url);
  };
  return (
    <div className="relative w-full flex items-center justify-center">
      <TooltipProvider delayDuration={10}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className=" mx-auto" variant="ghost" onClick={handleClick}>
              {icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export const columns: ColumnDef<IModel>[] = [
  {
    id: "select",
    header: ({table}) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({row}) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: any) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({column}) => {
      return (
        <Button
          className="w-full"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({row}) => (
      <div className="capitalize text-center">{row.getValue("name")}</div>
    ),
  },
  {
    accessorKey: "status",
    header: ({column}) => {
      return (
        <Button
          className="w-full"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({row}) => {
      const status = row.getValue("status");
      if (!status) return null;
      if (status === "success") {
        return (
          <p className=" font-bold py-2 px-4 rounded-lg text-center ">
            Success
          </p>
        );
      } else if (status === "processing") {
        return (
          <p className="text-white font-bold py-2 px-4 rounded-lg text-center bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 animate-pulse">
            Processing...
          </p>
        );
      } else {
        return null;
      }
    },
  },
  {
    accessorKey: "createdAt",
    header: ({column}) => {
      return (
        <Button
          className="w-full"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Create At
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({row}) => {
      const createdAt = row.getValue("createdAt") as string;
      return (
        <div className="lowercase text-center">
          {new Date(createdAt).toLocaleString("en-US")}
        </div>
      );
    },
  },
  {
    accessorKey: "viewer",
    header: () => {
      return (
        <Button className="w-full" variant="ghost">
          <View className="h-6 w-6" />
        </Button>
      );
    },
    cell: ({row}) => (
      <RowViewer
        model={row.original}
        tooltip="bim"
        icon={<View className="h-6 w-6" />}
      />
    ),
  },
  {
    accessorKey: "analyze",
    header: () => {
      return (
        <Button className="w-full" variant="ghost">
          <SquareDashedKanban className="h-6 w-6" />
        </Button>
      );
    },
    cell: ({row}) => (
      <RowViewer
        model={row.original}
        tooltip="analyze"
        icon={<SquareDashedKanban className="h-6 w-6" />}
      />
    ),
  },
];
const iconClassName = "h-[20px] w-[20px]";

/**
 *
 * @param param0
 * @returns
 */
const ProjectTable = ({
  selectProject,
  onUploadServer,
  onShare,
}: {
  selectProject: IProject;
  onUploadServer: () => void;
  onShare: () => void;
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const table = useReactTable({
    data: selectProject.models,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });
  const list: IProjectButton[] = [
    {
      tooltip: "Upload file",
      icon: <IoCloudUploadOutline className={iconClassName} />,
      onClick: onUploadServer,
    },
    {
      tooltip: "Shares",
      icon: <FaShareFromSquare className={iconClassName} />,
      onClick: onShare,
    },
  ];

  return (
    <div className="w-full p-2">
      <div className="flex justify-between items-center py-4">
        <Input
          placeholder="Filter names..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("name")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <div className="flex justify-end gap-2">
          <>
            {list.map((btn: IProjectButton, index: number) => (
              <ProjectButton
                key={`${btn.tooltip}-${index}`}
                tooltip={btn.tooltip}
                icon={btn.icon}
                onClick={btn.onClick}
              />
            ))}
          </>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectTable;
