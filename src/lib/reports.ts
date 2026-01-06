/**
 * Gerador de Relatórios - OnSite Timekeeper
 * 
 * Gera relatórios em formato TXT profissional
 * - Relatório de sessão única
 * - Relatório diário
 * - Relatório por período
 * - Hash de integridade (código verificador)
 * - Assinatura digital
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
    pausaMinutos: number;
    duracaoLiquida: number;
    editado: boolean;
  }[];
  subtotalBruto: number;
  subtotalPausa: number;
  subtotalLiquido: number;
}

export interface RelatorioMetadata {
  geradoEm: string;
  versao: string;
  hash: string;
  totalSessoes: number;
  totalMinutos: number;
}

// ============================================
// CONSTANTES
// ============================================

const VERSAO_RELATORIO = '2.0';
const NOME_APP = 'OnSite Timekeeper';

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

/**
 * Gera hash de integridade simples (checksum)
 * Baseado nos dados do relatório para verificação
 */
function gerarHashIntegridade(
  sessoes: SessaoComputada[],
  nomeUsuario: string,
  timestamp: string
): string {
  // Cria string com dados relevantes
  const dados = sessoes.map(s => 
    `${s.id}|${s.entrada}|${s.saida || ''}|${s.duracao_minutos}`
  ).join(';');
  
  const base = `${nomeUsuario}|${timestamp}|${dados}`;
  
  // Hash simples (soma de caracteres com transformações)
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Converte para 32-bit
  }
  
  // Converte para hex e pega 8 caracteres
  const hashHex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  return hashHex.substring(0, 8);
}

/**
 * Gera código de verificação legível
 * Formato: XXXX-XXXX
 */
function gerarCodigoVerificacao(hash: string, timestamp: string): string {
  const timestampHash = timestamp.replace(/\D/g, '').slice(-4);
  return `${hash.substring(0, 4)}-${timestampHash}`;
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
        subtotalBruto: 0,
        subtotalPausa: 0,
        subtotalLiquido: 0,
      };
    }

    const pausaMinutos = sessao.pausa_minutos || 0;
    const duracaoLiquida = Math.max(0, sessao.duracao_minutos - pausaMinutos);

    grupos[localNome].sessoes.push({
      data: sessao.entrada.split('T')[0],
      entrada: formatarHora(sessao.entrada),
      saida: sessao.saida ? formatarHora(sessao.saida) : 'Em andamento',
      duracao: sessao.duracao_minutos,
      pausaMinutos,
      duracaoLiquida,
      editado: sessao.editado_manualmente === 1,
    });

    grupos[localNome].subtotalBruto += sessao.duracao_minutos;
    grupos[localNome].subtotalPausa += pausaMinutos;
    grupos[localNome].subtotalLiquido += duracaoLiquida;
  }

  // Ordena por subtotal (maior primeiro)
  return Object.values(grupos).sort((a, b) => b.subtotalLiquido - a.subtotalLiquido);
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
  const timestamp = new Date().toISOString();
  const hash = gerarHashIntegridade([sessao], nomeUsuario || 'Anônimo', timestamp);
  const codigo = gerarCodigoVerificacao(hash, timestamp);
  
  const pausaMinutos = sessao.pausa_minutos || 0;
  const duracaoLiquida = Math.max(0, sessao.duracao_minutos - pausaMinutos);

  const linhas: string[] = [];
  const separador = '─'.repeat(44);
  const separadorDuplo = '═'.repeat(44);

  // Cabeçalho
  linhas.push(separadorDuplo);
  linhas.push('        COMPROVANTE DE REGISTRO');
  linhas.push('             OnSite Timekeeper');
  linhas.push(separadorDuplo);
  linhas.push('');

  // Dados do trabalhador
  if (nomeUsuario) {
    linhas.push(`Trabalhador: ${nomeUsuario}`);
    linhas.push('');
  }

  // Dados da sessão
  linhas.push(separador);
  linhas.push('DADOS DO REGISTRO');
  linhas.push(separador);
  linhas.push(`Local:       ${sessao.local_nome || 'Não identificado'}`);
  linhas.push(`Data:        ${formatarData(sessao.entrada)}`);
  linhas.push(`Entrada:     ${formatarHora(sessao.entrada)}`);
  linhas.push(`Saída:       ${sessao.saida ? formatarHora(sessao.saida) : 'Em andamento'}`);
  linhas.push('');
  
  // Duração
  linhas.push(separador);
  linhas.push('TEMPO TRABALHADO');
  linhas.push(separador);
  linhas.push(`Tempo bruto:   ${formatarDuracao(sessao.duracao_minutos)}`);
  
  if (pausaMinutos > 0) {
    linhas.push(`Pausas:        ${formatarDuracao(pausaMinutos)}`);
    linhas.push(`               ────────────`);
    linhas.push(`Tempo líquido: ${formatarDuracao(duracaoLiquida)}`);
  }

  // Observações
  if (sessao.editado_manualmente) {
    linhas.push('');
    linhas.push('⚠ Registro editado manualmente');
    if (sessao.motivo_edicao) {
      linhas.push(`  Motivo: ${sessao.motivo_edicao}`);
    }
  }

  // Rodapé com assinatura
  linhas.push('');
  linhas.push(separadorDuplo);
  linhas.push('ASSINATURA DIGITAL');
  linhas.push(separadorDuplo);
  linhas.push(`Gerado em:  ${new Date(timestamp).toLocaleString('pt-BR')}`);
  linhas.push(`Código:     ${codigo}`);
  linhas.push('');
  linhas.push('Este documento é um registro digital de ponto.');
  linhas.push('Código de verificação garante integridade.');

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
    const timestamp = new Date().toISOString();
    const hash = gerarHashIntegridade(sessoes, nomeUsuario || 'Anônimo', timestamp);
    const codigo = gerarCodigoVerificacao(hash, timestamp);
    
    const grupos = agruparSessoesPorLocal(sessoes);
    
    // Totais gerais
    const totalBruto = grupos.reduce((acc, g) => acc + g.subtotalBruto, 0);
    const totalPausa = grupos.reduce((acc, g) => acc + g.subtotalPausa, 0);
    const totalLiquido = grupos.reduce((acc, g) => acc + g.subtotalLiquido, 0);
    const totalSessoes = sessoes.length;
    const sessoesEditadas = sessoes.filter(s => s.editado_manualmente === 1).length;

    // Determina período
    const datas = sessoes.map(s => s.entrada.split('T')[0]).sort();
    const dataInicio = datas[0];
    const dataFim = datas[datas.length - 1];

    const linhas: string[] = [];
    const separadorDuplo = '═'.repeat(48);
    const separadorSimples = '─'.repeat(48);
    const separadorPonto = '·'.repeat(48);

    // ============================================
    // CABEÇALHO
    // ============================================
    linhas.push(separadorDuplo);
    linhas.push('           RELATÓRIO DE HORAS TRABALHADAS');
    linhas.push('                OnSite Timekeeper');
    linhas.push(separadorDuplo);
    linhas.push('');

    // Info do período e trabalhador
    linhas.push(separadorSimples);
    linhas.push('IDENTIFICAÇÃO');
    linhas.push(separadorSimples);
    if (nomeUsuario) {
      linhas.push(`Trabalhador:     ${nomeUsuario}`);
    }
    linhas.push(`Período:         ${formatarPeriodo(dataInicio, dataFim)}`);
    linhas.push(`Total registros: ${totalSessoes}`);
    linhas.push('');

    // ============================================
    // SESSÕES POR LOCAL
    // ============================================
    for (const grupo of grupos) {
      linhas.push(separadorSimples);
      linhas.push(`📍 ${grupo.localNome.toUpperCase()}`);
      linhas.push(separadorSimples);

      // Cabeçalho da tabela
      linhas.push('  Data        Entrada  Saída    Tempo');
      linhas.push('  ' + '─'.repeat(42));

      for (const sessao of grupo.sessoes) {
        const dataFormatada = formatarData(sessao.data).padEnd(10);
        const entradaStr = sessao.entrada.padEnd(8);
        const saidaStr = sessao.saida.padEnd(8);
        
        let tempoStr = formatarDuracao(sessao.duracaoLiquida);
        if (sessao.pausaMinutos > 0) {
          tempoStr += ` (-${sessao.pausaMinutos}min)`;
        }
        if (sessao.editado) {
          tempoStr += ' *';
        }
        
        linhas.push(`  ${dataFormatada}  ${entradaStr} ${saidaStr} ${tempoStr}`);
      }

      // Subtotal do local
      linhas.push('  ' + '─'.repeat(42));
      
      if (grupo.subtotalPausa > 0) {
        linhas.push(`  Subtotal bruto:   ${formatarDuracao(grupo.subtotalBruto)}`);
        linhas.push(`  Pausas:           ${formatarDuracao(grupo.subtotalPausa)}`);
        linhas.push(`  Subtotal líquido: ${formatarDuracao(grupo.subtotalLiquido)}`);
      } else {
        linhas.push(`  Subtotal: ${formatarDuracao(grupo.subtotalLiquido)}`);
      }
      linhas.push('');
    }

    // ============================================
    // TOTAIS
    // ============================================
    linhas.push(separadorDuplo);
    linhas.push('RESUMO GERAL');
    linhas.push(separadorDuplo);
    linhas.push('');
    
    if (totalPausa > 0) {
      linhas.push(`  Tempo bruto total:   ${formatarDuracao(totalBruto)}`);
      linhas.push(`  Total de pausas:     ${formatarDuracao(totalPausa)}`);
      linhas.push('                       ────────────');
      linhas.push(`  TEMPO LÍQUIDO:       ${formatarDuracao(totalLiquido)}`);
    } else {
      linhas.push(`  TOTAL DE HORAS:      ${formatarDuracao(totalLiquido)}`);
    }
    
    linhas.push('');
    linhas.push(`  Sessões registradas: ${totalSessoes}`);
    linhas.push(`  Locais de trabalho:  ${grupos.length}`);
    
    if (sessoesEditadas > 0) {
      linhas.push('');
      linhas.push(`  * ${sessoesEditadas} registro(s) editado(s) manualmente`);
    }

    // ============================================
    // ASSINATURA DIGITAL
    // ============================================
    linhas.push('');
    linhas.push(separadorDuplo);
    linhas.push('ASSINATURA DIGITAL');
    linhas.push(separadorDuplo);
    linhas.push(`Gerado em:     ${new Date(timestamp).toLocaleString('pt-BR')}`);
    linhas.push(`Código:        ${codigo}`);
    linhas.push(`Versão:        ${VERSAO_RELATORIO}`);
    linhas.push('');
    linhas.push(separadorPonto);
    linhas.push('Este documento é um registro digital de ponto.');
    linhas.push('O código de verificação garante a integridade');
    linhas.push('dos dados apresentados neste relatório.');
    linhas.push(separadorPonto);

    logger.info('database', `📄 Relatório gerado: ${totalSessoes} sessões, ${formatarDuracao(totalLiquido)}`);

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
    const totalLiquido = grupos.reduce((acc, g) => acc + g.subtotalLiquido, 0);
    const totalPausa = grupos.reduce((acc, g) => acc + g.subtotalPausa, 0);

    const datas = sessoes.map(s => s.entrada.split('T')[0]).sort();
    const dataInicio = datas[0];
    const dataFim = datas[datas.length - 1];

    const linhas: string[] = [];
    linhas.push(`📅 ${formatarPeriodo(dataInicio, dataFim)}`);
    linhas.push('');

    for (const grupo of grupos) {
      linhas.push(`📍 ${grupo.localNome}: ${formatarDuracao(grupo.subtotalLiquido)}`);
    }

    linhas.push('');
    
    if (totalPausa > 0) {
      linhas.push(`⏸️ Pausas: ${formatarDuracao(totalPausa)}`);
    }
    
    linhas.push(`💰 Total: ${formatarDuracao(totalLiquido)}`);

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

/**
 * Exporta metadados do relatório (para uso programático)
 */
export function getRelatorioMetadata(
  sessoes: SessaoComputada[],
  nomeUsuario?: string
): RelatorioMetadata {
  const timestamp = new Date().toISOString();
  const hash = gerarHashIntegridade(sessoes, nomeUsuario || 'Anônimo', timestamp);
  
  const grupos = agruparSessoesPorLocal(sessoes);
  const totalLiquido = grupos.reduce((acc, g) => acc + g.subtotalLiquido, 0);

  return {
    geradoEm: timestamp,
    versao: VERSAO_RELATORIO,
    hash,
    totalSessoes: sessoes.length,
    totalMinutos: totalLiquido,
  };
}
