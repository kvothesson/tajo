import type { Mutation, MutationId } from './types';
import { C } from '../render/palette';

export const MUTATIONS: readonly Mutation[] = [
  {
    id: 'extra_charge',
    name: 'BATERÍA',
    desc: '+1 carga de tajo.',
    color: C.cyan,
  },
  {
    id: 'long_blade',
    name: 'FILO LARGO',
    desc: 'El tajo recorre 40% más.',
    color: C.cyan,
  },
  {
    id: 'shrapnel',
    name: 'ESQUIRLA',
    desc: 'Cada muerte dispara 5 astillas letales.',
    color: C.amber,
  },
  {
    id: 'afterburn',
    name: 'RASTRO',
    desc: 'El tajo deja una estela que mata 1.4s.',
    color: C.orange,
  },
  {
    id: 'focus_battery',
    name: 'CALMA',
    desc: 'El foco dura el doble y recarga más rápido.',
    color: C.violet,
  },
  {
    id: 'bloodline',
    name: 'SANGRÍA',
    desc: 'Cada 12 muertes cae una reparación.',
    color: C.green,
  },
  {
    id: 'phase',
    name: 'FASE',
    desc: 'El tajo atraviesa los escudos de Guardián.',
    color: C.green,
  },
  {
    id: 'siphon',
    name: 'SIFÓN',
    desc: 'Matar con combo 8+ devuelve 2 cargas.',
    color: C.cyan,
  },
  {
    id: 'momentum',
    name: 'INERCIA',
    desc: '+25% de velocidad, recuperación más corta.',
    color: C.magenta,
  },
  {
    id: 'chain',
    name: 'CADENA',
    desc: 'Cada muerte durante el tajo lo extiende.',
    color: C.gold,
  },
  {
    id: 'nova',
    name: 'NOVA',
    desc: 'Recibir daño detona una onda letal.',
    color: C.red,
  },
  {
    id: 'greed',
    name: 'CODICIA',
    desc: '+50% de puntaje, pero empezás cada ola con 1 carga.',
    color: C.gold,
  },
] as const;

export const MUT: Record<MutationId, Mutation> = Object.fromEntries(
  MUTATIONS.map((m) => [m.id, m]),
) as Record<MutationId, Mutation>;
