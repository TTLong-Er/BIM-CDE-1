import * as OBC from "@thatopen/components";
import {
  IfcStreamerComponent,
  StreamPropertiesSettings,
} from "../IfcStreamerComponent";

import {setNotify} from "@components/Notify/baseNotify";
import {propertyUrl} from "@api/core";
import axios from "axios";
import {spinnerSignal} from "@bim/signals";
import * as fflate from "fflate";

/**
 *
 */
export class IfcTilerComponent extends OBC.Component implements OBC.Disposable {
  //1 attribute
  /**
   * A unique identifier for the component.
   * This UUID is used to register the component within the Components system.
   */
  static readonly uuid = "245d14fc-e534-4b5e-bdef-c1ca3e6bb734" as const;
  readonly aws3Host = import.meta.env.VITE_AWS3_HOST;

  enabled = false;

  readonly onDisposed: OBC.Event<any> = new OBC.Event();

  /**
   *
   * @param components
   */
  constructor(components: OBC.Components) {
    super(components);
    this.components.add(IfcTilerComponent.uuid, this);
  }
  //3 method
  async dispose() {
    this.onDisposed.trigger(this);
    this.onDisposed.reset();
    console.log("disposed IfcTilerComponent");
  }

  streamFromServer = async (modelId: string, projectId: string) => {
    try {
      spinnerSignal.value = true;
      const customIfcStreamer = this.components.get(IfcStreamerComponent);
      if (!customIfcStreamer)
        throw new Error("customIfcStreamer is not initialized!");
      const serverUrl = `${this.aws3Host}/${projectId}/${modelId}`;
      const baseUrl = `${this.aws3Host}/${projectId}/${modelId}/`;
      customIfcStreamer.fromServer = true;

      const [
        groupRaw,
        settingsRaw,
        propertyRaw,
        propertyIndexesRaw,
        modelTreeRaw,
      ] = await Promise.all([
        await axios({
          url: `${serverUrl}/fragmentsGroup.frag`,
          method: "GET",
          responseType: "arraybuffer",
        }),
        await axios({
          url: `${serverUrl}/Settings`,
          method: "GET",
          responseType: "arraybuffer",
        }),
        await axios({
          url: `${serverUrl}/properties.json`,
          method: "GET",
          responseType: "arraybuffer",
        }),
        await axios({
          url: `${serverUrl}/properties-indexes.json`,
          method: "GET",
          responseType: "arraybuffer",
        }),
        await axios({
          url: `${serverUrl}/modelTree`,
          method: "GET",
          responseType: "arraybuffer",
        }),
      ]);

      const decompressedSetting = fflate.decompressSync(
        new Uint8Array(settingsRaw.data)
      );
      const setting = JSON.parse(fflate.strFromU8(decompressedSetting));

      const group = new Uint8Array(groupRaw.data);

      const decompressedProperty = fflate.decompressSync(
        new Uint8Array(propertyRaw.data)
      );
      const property = JSON.parse(fflate.strFromU8(decompressedProperty));
      const {ids, types, indexesFile} = property;
      const decompressedPropertyIndexes = fflate.decompressSync(
        new Uint8Array(propertyIndexesRaw.data)
      );
      const propertyIndexes = JSON.parse(
        fflate.strFromU8(decompressedPropertyIndexes)
      );
      const properties = {
        ids,
        types,
        indexesFile,
        relationsMap: this.getRelationsMapFromJSON(propertyIndexes),
      } as StreamPropertiesSettings;
      await customIfcStreamer.loadFromServer(
        setting,
        group,
        true,
        serverUrl,
        baseUrl,
        properties
      );

      const decompressedModelTree = fflate.decompressSync(
        new Uint8Array(modelTreeRaw.data)
      );
      const modelTree = JSON.parse(fflate.strFromU8(decompressedModelTree));
    } catch (error: any) {
      console.log(error);
      setNotify(error.message, false);
    }
    spinnerSignal.value = false;
  };
  private getRelationsMapFromJSON(relations: any) {
    const indexMap: OBC.RelationsMap = new Map();
    for (const expressID in relations) {
      const expressIDRelations = relations[expressID];
      const relationMap = new Map<number, number[]>();
      for (const relationID in expressIDRelations) {
        relationMap.set(Number(relationID), expressIDRelations[relationID]);
      }
      indexMap.set(Number(expressID), relationMap);
    }
    return indexMap;
  }
}
