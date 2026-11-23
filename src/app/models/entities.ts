export interface Categoria {
  id: string;
  nome: string;
}

export interface Fornitore {
  id: string;
  ragioneSociale: string;
  email: string;
  telefono: string;
}

export interface Prodotto {
  id: string;
  sku: string; // Unico, formato ABC-0001
  nome: string;
  descrizione: string;
  categoriaId: string;
  fornitoreId: string;
  prezzoVendita: number;
  scortaMinima: number;
  attivo: boolean;
}

export type TipoMovimento = 'carico' | 'scarico';

export interface Movimento {
  id: string;
  prodottoId: string;
  tipo: TipoMovimento;
  quantita: number; // intera, > 0
  data: string; // ISO string YYYY-MM-DDTHH:mm:ss
  causale: string;
  ordineId?: string; // facoltativo
  operatore?: string;
}

export interface RigaOrdine {
  prodottoId: string;
  quantita: number;
  prezzoUnitario: number; // congelato al momento dell'ordine
}

export type StatoOrdine = 'nuovo' | 'in preparazione' | 'spedito' | 'consegnato' | 'annullato';

export interface Ordine {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  stato: StatoOrdine;
  righe: RigaOrdine[];
}

export type RuoloUtente = 'magazziniere' | 'commerciale' | 'amministratore';

export interface Utente {
  id: string;
  email: string;
  password: string;
  nome: string;
  ruolo: RuoloUtente;
}

export type TipoOperazioneAudit =
  | 'creazione_prodotto'
  | 'modifica_prodotto'
  | 'eliminazione_prodotto'
  | 'registrazione_movimento'
  | 'creazione_ordine'
  | 'cambio_stato_ordine'
  | 'annullamento_ordine'
  | 'creazione_categoria'
  | 'modifica_categoria'
  | 'eliminazione_categoria'
  | 'creazione_fornitore'
  | 'modifica_fornitore'
  | 'eliminazione_fornitore';

export interface OperazioneAudit {
  id: string;
  timestamp: string;
  operatore: string;
  ruolo: RuoloUtente;
  tipo: TipoOperazioneAudit;
  descrizione: string;
  datiPrecedenti?: any;
  datiNuovi?: any;
  entitaId?: string;
  annullabile: boolean;
}

export type StatoScorta = 'Esaurito' | 'Sotto scorta' | 'Ok';

export interface ProdottoConGiacenza extends Prodotto {
  giacenza: number;
  statoScorta: StatoScorta;
  quantitaDaRiordinare: number;
  nomeCategoria?: string;
  nomeFornitore?: string;
}
