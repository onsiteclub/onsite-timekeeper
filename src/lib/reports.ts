/**
 * Gerador de Relatórios - OnSite Timekeeper
 * 
 * Gera relatórios em formato TXT simples
 * - Relatório de sessão única
 * - Relatório diário
 * - Relatório por período
 * - Agrupado por local
 */

import { SessaoComputada, formatarDuracao } from './database';
import { logger } from './logger';

// ============================================
// TIPOS
// ============================================

export interface RelatorioAgrupado {
  localNome: string;
  sessoes: {
    data: string;
    entrada: string;
    saida: string;
    duracao: number;
  }[];
  subtotal: number;
}

// ============================================
// HELPERS
// ============================================

/**
 * Formata data ISO para DD/MM/YYYY
 */
function formatarData(dataISO: string): string {
  try {
    const [ano, mes, dia] = dataISO.split('T')[0].split('-');
    return `${dia}/${mes}/${ano}`;
  } catch {
    return dataISO;
  }
}

/**
 * Formata hora de ISO para HH:MM
 */
function formatarHora(dataISO: string): string {
  try {
    const date = new Date(dataISO);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

/**
 * Formata período para exibição
 */
function formatarPeriodo(dataInicio: string, dataFim: string): string {
  const inicio = formatarData(dataInicio);
  const fim = formatarData(dataFim);
  
  if (inicio === fim) {
    return inicio;
  }
  return `${inicio} a ${fim}`;
}

// ============================================
// AGRUPAMENTO
// ============================================

/**
 * Agrupa sessões por local de trabalho
 */
export function agruparSessoesPorLocal(sessoes: SessaoComputada[]): RelatorioAgrupado[] {
  const grupos: Record<string, RelatorioAgrupado> = {};

  for (const sessao of sessoes) {
    const localNome = sessao.local_nome || 'Local não identificado';

    if (!grupos[localNome]) {
      grupos[localNome] = {
        localNome,
        sessoes: [],
        subtotal: 0,
      };
    }

    grupos[localNome].sessoes.push({
      data: sessao.entrada.split('T')[0],
      entrada: formatarHora(sessao.entrada),
      saida: sessao.saida ? formatarHora(sessao.saida) : 'Em andamento',
      duracao: sessao.duracao_minutos,
    });

    grupos[localNome].subtotal += sessao.duracao_minutos;
  }

  // Ordena por subtotal (maior primeiro)
  return Object.values(grupos).sort((a, b) => b.subtotal - a.subtotal);
}

// ============================================
// RELATÓRIOS TXT
// ============================================

/**
 * Gera relatório de uma única sessão
 */
export function gerarRelatorioSessao(
  sessao: SessaoComputada,
  nomeUsuario?: string
): string {
  const linhas: string[] = [];
  const separador = '─'.repeat(40);

  linhas.push(separador);
  linhas.push('     REGISTRO DE TRABALHO');
  linhas.push(separador);
  linhas.push('');
  linhas.push(`📅 Data: ${formatarData(sessao.entrada)}`);
  linhas.push(`📍 Local: ${sessao.local_nome || 'Não identificado'}`);
  linhas.push(`🕐 Entrada: ${formatarHora(sessao.entrada)}`);
  linhas.push(`🕐 Saída: ${sessao.saida ? formatarHora(sessao.saida) : 'Em andamento'}`);
  linhas.push(`⏱️ Duração: ${formatarDuracao(sessao.duracao_minutos)}`);
  
  if (nomeUsuario) {
    linhas.push(`👤 Trabalhador: ${nomeUsuario}`);
  }

  if (sessao.editado_manualmente) {
    linhas.push('');
    linhas.push('⚠️ Horário ajustado manualmente');
  }

  linhas.push('');
  linhas.push(separador);
  linhas.push(`OnSite Timekeeper • ${new Date().toLocaleString('pt-BR')}`);

  return linhas.join('\n');
}

/**
 * Gera relatório completo por período
 */
export function gerarRelatorioCompleto(
  sessoes: SessaoComputada[],
  nomeUsuario?: string
): string {
  if (!sessoes || sessoes.length === 0) {
    return 'Nenhuma sessão encontrada no período selecionado.';
  }

  try {
    const grupos = agruparSessoesPorLocal(sessoes);
    const totalGeral = grupos.reduce((acc, g) => acc + g.subtotal, 0);
    const totalSessoes = sessoes.length;

    // Determina período
    const datas = sessoes.map(s => s.entrada.split('T')[0]).sort();
    const dataInicio = datas[0];
    const dataFim = datas[datas.length - 1];

    const linhas: string[] = [];
    const separadorDuplo = '═'.repeat(40);
    const separadorSimples = '─'.repeat(40);

    // Cabeçalho
    linhas.push(separadorDuplo);
    linhas.push('       RELATÓRIO DE HORAS');
    linhas.push(separadorDuplo);
    linhas.push('');

    // Info do período
    linhas.push(`📅 Período: ${formatarPeriodo(dataInicio, dataFim)}`);
    if (nomeUsuario) {
      linhas.push(`👤 Trabalhador: ${nomeUsuario}`);
    }
    linhas.push(`📊 Total de registros: ${totalSessoes}`);
    linhas.push('');

    // Sessões por local
    for (const grupo of grupos) {
      linhas.push(separadorSimples);
      linhas.push(`📍 ${grupo.localNome.toUpperCase()}`);
      linhas.push(separadorSimples);

      for (const sessao of grupo.sessoes) {
        const duracaoStr = sessao.duracao > 0 
          ? formatarDuracao(sessao.duracao)
          : '(em andamento)';
        linhas.push(`  ${formatarData(sessao.data)}  ${sessao.entrada} → ${sessao.saida}  [${duracaoStr}]`);
      }

      linhas.push(`  ${'─'.repeat(36)}`);
      linhas.push(`  Subtotal: ${formatarDuracao(grupo.subtotal)}`);
      linhas.push('');
    }

    // Total geral
    linhas.push(separadorDuplo);
    linhas.push(`   TOTAL GERAL: ${formatarDuracao(totalGeral)}`);
    linhas.push(separadorDuplo);
    linhas.push('');

    // Rodapé
    linhas.push(`Gerado por OnSite Timekeeper`);
    linhas.push(`${new Date().toLocaleString('pt-BR')}`);

    logger.info('database', `📄 Relatório gerado: ${totalSessoes} sessões, ${formatarDuracao(totalGeral)}`);

    return linhas.join('\n');
  } catch (error) {
    logger.error('database', 'Erro ao gerar relatório', { error: String(error) });
    return `Erro ao gerar relatório: ${String(error)}`;
  }
}

/**
 * Gera resumo rápido (para preview)
 */
export function gerarResumo(sessoes: SessaoComputada[]): string {
  if (!sessoes || sessoes.length === 0) {
    return 'Nenhuma sessão selecionada.';
  }

  try {
    const grupos = agruparSessoesPorLocal(sessoes);
    const totalGeral = grupos.reduce((acc, g) => acc + g.subtotal, 0);

    const datas = sessoes.map(s => s.entrada.split('T')[0]).sort();
    const dataInicio = datas[0];
    const dataFim = datas[datas.length - 1];

    const linhas: string[] = [];
    linhas.push(`📅 ${formatarPeriodo(dataInicio, dataFim)}`);
    linhas.push('');

    for (const grupo of grupos) {
      linhas.push(`📍 ${grupo.localNome}: ${formatarDuracao(grupo.subtotal)}`);
    }

    linhas.push('');
    linhas.push(`💰 Total: ${formatarDuracao(totalGeral)}`);

    return linhas.join('\n');
  } catch (error) {
    return `Erro ao gerar resumo: ${String(error)}`;
  }
}

/**
 * Gera relatório do dia atual
 */
export function gerarRelatorioDia(
  sessoes: SessaoComputada[],
  nomeUsuario?: string
): string {
  const hoje = new Date().toISOString().split('T')[0];
  const sessoesHoje = sessoes.filter(s => s.entrada.startsWith(hoje));
  
  if (sessoesHoje.length === 0) {
    return `Nenhum registro para hoje (${formatarData(hoje)}).`;
  }

  return gerarRelatorioCompleto(sessoesHoje, nomeUsuario);
}
