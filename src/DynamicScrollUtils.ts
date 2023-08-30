import { DataBase, DataEntry } from "./DynamicScroll";

export const END_OF_STREAM = Symbol('END_OF_STREAM')

export const getHeight =  <T extends DataBase>(en: DataEntry<T>) => {
  return en.size
};