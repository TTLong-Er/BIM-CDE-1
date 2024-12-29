import React, {memo, useId, useState} from "react";
import {debounce} from "lodash";

import isNaN from "lodash/isNaN";
import isNumber from "lodash/isNumber";
import isString from "lodash/isString";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {Button} from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@components/ui/tooltip";

import {mapBoxSignal} from "@bim/signals";

export function parseText(text: string) {
  if (isNumber(text)) return text;

  if (isString(text)) {
    text = text.trim();

    if (!text) return "";
    const num = parseFloat(text);

    if (!isNaN(num)) {
      return num;
    }
  }

  return "";
}

const InputField = ({label}: {label: string}) => {
  const fieldId = useId();
  const [error, setError] = useState<boolean>(false);
  const debouncedSearch = debounce(async (criteria) => {
    const text = parseText(criteria);
    setError(typeof text === "string");
  }, 300);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    debouncedSearch(e.target.value);
  }
  return (
    <div className="flex justify-start mt-2">
      <Label htmlFor={fieldId} className="w-[20%] my-auto mx-3">
        {label}
      </Label>
      <Input
        id={fieldId}
        className={`flex-1 ${error ? "text-red-600" : ""}`}
        onChange={handleChange}
      />
    </div>
  );
};

const ModelCoord = () => {
  return (
    <Accordion type="single" className="w-full" defaultValue={"item-1"}>
      <AccordionItem value="item-1">
        {mapBoxSignal.value && (
          <>
            <AccordionTrigger>Model Coordination</AccordionTrigger>
            <AccordionContent>
              <div className="px-1">
                <InputField label={"X"} />
                <InputField label={"Y"} />
                <InputField label={"Z"} />
                <InputField label={"Rotation"} />
                <InputField label={"Lng"} />
                <InputField label={"Lat"} />
              </div>

              <div className="w-full p-2 flex items-center border-b-1">
                <TooltipProvider delayDuration={10}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={"outline"}
                        className="w-[100%] m-auto flex justify-center bg-gradient-to-r
                from-slate-600 to-blue-500
                disabled:cursor-none
                disabled:opacity-35
                "
                      >
                        <Label className="mx-2">Apply</Label>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      className="text-white bg-slate-900"
                    >
                      Open local
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </AccordionContent>
          </>
        )}
      </AccordionItem>
    </Accordion>
  );
};

export default memo(ModelCoord);
