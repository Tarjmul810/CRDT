export type ElementId = {
  clientId: string;
  sequence: number;
};

export type Element = {
  id: ElementId;
  value: string;
  after: ElementId | null;
  deleted: boolean;
};

export type InsertOperation = {
  type: "insert";
  id: ElementId;
  element: Element;
};

export type DeleteOperation = {
  type: "delete";
  id: ElementId;
  target: ElementId;
};

export type Operation =
  | InsertOperation
  | DeleteOperation;