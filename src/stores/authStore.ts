/**
 * Auth Store - OnSite Timekeeper
 * 
 * Gerencia autenticação com Supabase
 * - Login/Logout
 * - Registro de usuário
 * - Sessão persistente
 */

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logger } from '../lib/logger';
import type { User, Session } from '@supabase/supabase-js';

// ============================================
// TIPOS
// ============================================

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  
  // Helpers
  getUserId: () => string | null;
  getUserEmail: () => string | null;
  getUserName: () => string | null;
}

// ============================================
// STORE
// ============================================

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    try {
      logger.info('boot', '🔐 Inicializando autenticação...');

      // Verifica se Supabase está configurado
      if (!isSupabaseConfigured()) {
        logger.warn('auth', 'Supabase não configurado - modo offline');
        set({ isLoading: false });
        return;
      }

      // Tenta restaurar sessão existente
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        logger.error('auth', 'Erro ao restaurar sessão', { error: error.message });
        set({ isLoading: false });
        return;
      }

      if (session) {
        set({
          user: session.user,
          session,
          isAuthenticated: true,
          isLoading: false,
        });
        logger.info('auth', '✅ Sessão restaurada', { 
          userId: session.user.id,
          email: session.user.email 
        });
      } else {
        set({ isLoading: false });
        logger.info('auth', 'Nenhuma sessão ativa');
      }

      // Listener para mudanças de autenticação
      supabase.auth.onAuthStateChange((event, session) => {
        logger.debug('auth', `Auth event: ${event}`);
        
        // Ignora INITIAL_SESSION pois já tratamos no getSession()
        if (event === 'INITIAL_SESSION') {
          return;
        }
        
        set({
          user: session?.user ?? null,
          session: session ?? null,
          isAuthenticated: !!session,
        });

        if (event === 'SIGNED_IN') {
          logger.info('auth', '✅ Login realizado');
        } else if (event === 'SIGNED_OUT') {
          logger.info('auth', '👋 Logout realizado');
        }
      });
    } catch (error) {
      logger.error('auth', 'Erro na inicialização', { error: String(error) });
      set({ isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      logger.info('auth', '🔑 Tentando login...', { email });

      if (!isSupabaseConfigured()) {
        return { error: 'Supabase não configurado' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.warn('auth', '❌ Falha no login', { error: error.message });
        
        // Traduz mensagens de erro comuns
        let mensagem = error.message;
        if (error.message.includes('Invalid login')) {
          mensagem = 'Email ou senha incorretos';
        } else if (error.message.includes('Email not confirmed')) {
          mensagem = 'Confirme seu email antes de fazer login';
        }
        
        return { error: mensagem };
      }

      set({
        user: data.user,
        session: data.session,
        isAuthenticated: true,
      });

      logger.info('auth', '✅ Login bem-sucedido', { userId: data.user?.id });
      return { error: null };
    } catch (error) {
      logger.error('auth', 'Erro no login', { error: String(error) });
      return { error: 'Erro ao fazer login. Tente novamente.' };
    }
  },

  signUp: async (email: string, password: string, nome: string) => {
    try {
      logger.info('auth', '📝 Registrando novo usuário...', { email });

      if (!isSupabaseConfigured()) {
        return { error: 'Supabase não configurado' };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nome },
        },
      });

      if (error) {
        logger.warn('auth', '❌ Falha no registro', { error: error.message });
        
        let mensagem = error.message;
        if (error.message.includes('already registered')) {
          mensagem = 'Este email já está cadastrado';
        } else if (error.message.includes('Password')) {
          mensagem = 'Senha deve ter pelo menos 6 caracteres';
        }
        
        return { error: mensagem };
      }

      // Supabase pode requerer confirmação de email
      if (data.user && !data.session) {
        logger.info('auth', '📧 Email de confirmação enviado');
        return { error: null };
      }

      if (data.session) {
        set({
          user: data.user,
          session: data.session,
          isAuthenticated: true,
        });
      }

      logger.info('auth', '✅ Registro bem-sucedido', { userId: data.user?.id });
      return { error: null };
    } catch (error) {
      logger.error('auth', 'Erro no registro', { error: String(error) });
      return { error: 'Erro ao criar conta. Tente novamente.' };
    }
  },

  signOut: async () => {
    try {
      logger.info('auth', '🚪 Fazendo logout...');

      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }

      set({
        user: null,
        session: null,
        isAuthenticated: false,
      });

      logger.info('auth', '✅ Logout realizado');
    } catch (error) {
      logger.error('auth', 'Erro no logout', { error: String(error) });
      // Força logout local mesmo se falhar no servidor
      set({
        user: null,
        session: null,
        isAuthenticated: false,
      });
    }
  },

  getUserId: () => {
    return get().user?.id ?? null;
  },

  getUserEmail: () => {
    return get().user?.email ?? null;
  },

  getUserName: () => {
    return get().user?.user_metadata?.nome ?? null;
  },
}));
