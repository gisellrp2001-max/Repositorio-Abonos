import * as React from 'react';
import { Abono, Cliente, Conf, FormData, OcrData } from '../model';
import { SpService, Diagnostics } from '../services/SpService';
import { OcrService } from '../services/OcrService';
import { ConfirmOpts } from './ui';

export type View = 'inicio' | 'nuevo' | 'mis' | 'bandeja' | 'detalle' | 'clientes' | 'cliente' | 'reportes' | 'config';

export type ItemStatus = 'preparando' | 'pendiente' | 'analizando' | 'revisar' | 'confirmar' | 'registrando' | 'registrado' | 'error';

/** Un voucher dentro de un lote. Cada uno se registra como un abono independiente. */
export interface Item {
  key: string;
  file: File;
  name: string;
  size: number;
  isPdf: boolean;
  jpg: Blob | null;
  preview: string;
  status: ItemStatus;
  err: string;
  anStart: number;
  ocr: OcrData | null;
  conf: Partial<Record<string, Conf>>;
  form: FormData;
  note: string;
  manual: boolean;
  clienteId: number | null;
  cliSug: boolean;
  cq: string;
  revOk: boolean;
  dupOk: boolean;
  missing: string[];
  start: number;
  savedId?: number;
  code?: string;
}

export interface Flow { stage: 'carga' | 'lote'; items: Item[]; active: string | null; }

export interface Ctx {
  sp: SpService;
  ocr: OcrService;
  abonos: Abono[];
  clientes: Cliente[];
  isG: boolean;
  isAdmin: boolean;
  meId: number;
  meName: string;
  diag: Diagnostics | null;
  loading: boolean;
  view: View;
  param: string | null;
  go: (v: View, p?: string | null) => void;
  refresh: () => Promise<void>;
  toast: (m: string) => void;
  confirm: (o: ConfirmOpts) => void;
  flow: Flow;
  setFlow: React.Dispatch<React.SetStateAction<Flow>>;
  tick: number;
}

export const AppCtx = React.createContext<Ctx>(null as unknown as Ctx);
export const useApp = (): Ctx => React.useContext(AppCtx);
