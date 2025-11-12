/**
 * Tests para Credentials Manager
 * Verifica almacenamiento, recuperación y validación de credenciales
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateCredentialId,
  getAllCredentials,
  getCredentialsByType,
  getCredentialById,
  saveCredential,
  deleteCredential,
  validateCredential,
  mapToolTypeToCredentialType,
  getCredentialTypeLabel
} from '../../services/credentialsManager';
import type { Credential, SupabaseCredential, GoogleServiceAccountCredential } from '../../services/credentialsManager';
import {
  createMockSupabaseCredential,
  createMockGoogleServiceAccountCredential
} from '../helpers/testData';

describe('Credentials Manager', () => {
  beforeEach(() => {
    // Limpiar localStorage antes de cada test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('generateCredentialId', () => {
    it('debe generar un ID único con prefijo cred_', () => {
      const id = generateCredentialId();
      
      expect(id).toMatch(/^cred_\d+_[a-z0-9]+$/);
    });

    it('debe generar IDs diferentes en llamadas sucesivas', () => {
      const id1 = generateCredentialId();
      const id2 = generateCredentialId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('saveCredential', () => {
    it('debe guardar una credencial nueva correctamente', () => {
      const credential = createMockSupabaseCredential();
      
      saveCredential(credential);
      
      const saved = getCredentialById(credential.id);
      expect(saved).toEqual(credential);
    });

    it('debe actualizar una credencial existente', () => {
      const credential = createMockSupabaseCredential();
      saveCredential(credential);

      const updated: SupabaseCredential = {
        ...credential,
        name: 'Updated Name',
        data: {
          ...credential.data,
          url: 'https://updated.supabase.co'
        }
      };

      saveCredential(updated);

      const saved = getCredentialById(credential.id);
      expect(saved?.name).toBe('Updated Name');
      expect((saved as SupabaseCredential)?.data.url).toBe('https://updated.supabase.co');
    });

    it('debe actualizar timestamp de updatedAt', () => {
      const credential = createMockSupabaseCredential();
      const initialTime = Date.now();
      
      saveCredential(credential);
      
      const saved = getCredentialById(credential.id);
      expect(saved?.updatedAt).toBeGreaterThanOrEqual(initialTime);
    });

    it('debe preservar createdAt al actualizar', () => {
      const credential = createMockSupabaseCredential();
      credential.createdAt = 1000000; // Timestamp antiguo
      
      saveCredential(credential);
      
      const updated = { ...credential, name: 'Updated' };
      saveCredential(updated);
      
      const saved = getCredentialById(credential.id);
      expect(saved?.createdAt).toBe(1000000);
    });
  });

  describe('getAllCredentials', () => {
    it('debe retornar array vacío si no hay credenciales', () => {
      const creds = getAllCredentials();
      expect(creds).toEqual([]);
    });

    it('debe retornar todas las credenciales guardadas', () => {
      const cred1 = createMockSupabaseCredential();
      const cred2 = createMockGoogleServiceAccountCredential();
      
      saveCredential(cred1);
      saveCredential(cred2);
      
      const all = getAllCredentials();
      expect(all).toHaveLength(2);
      expect(all.map(c => c.id)).toContain(cred1.id);
      expect(all.map(c => c.id)).toContain(cred2.id);
    });
  });

  describe('getCredentialsByType', () => {
    beforeEach(() => {
      const cred1 = createMockSupabaseCredential();
      const cred2 = createMockGoogleServiceAccountCredential();
      const cred3 = createMockSupabaseCredential();
      cred3.id = 'cred-supabase-456';
      
      saveCredential(cred1);
      saveCredential(cred2);
      saveCredential(cred3);
    });

    it('debe filtrar credenciales por tipo', () => {
      const supabase = getCredentialsByType('supabase');
      expect(supabase).toHaveLength(2);
      expect(supabase.every(c => c.type === 'supabase')).toBe(true);
    });

    it('debe retornar array vacío si no hay credenciales del tipo', () => {
      const smtp = getCredentialsByType('smtp');
      expect(smtp).toEqual([]);
    });

    it('debe retornar credenciales de Google Service Account', () => {
      const google = getCredentialsByType('google-service-account');
      expect(google).toHaveLength(1);
      expect(google[0].type).toBe('google-service-account');
    });
  });

  describe('getCredentialById', () => {
    it('debe retornar la credencial correcta por ID', () => {
      const credential = createMockSupabaseCredential();
      saveCredential(credential);
      
      const found = getCredentialById(credential.id);
      expect(found).toEqual(credential);
    });

    it('debe retornar null si el ID no existe', () => {
      const found = getCredentialById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('deleteCredential', () => {
    it('debe eliminar una credencial existente', () => {
      const credential = createMockSupabaseCredential();
      saveCredential(credential);
      
      const deleted = deleteCredential(credential.id);
      expect(deleted).toBe(true);
      
      const found = getCredentialById(credential.id);
      expect(found).toBeNull();
    });

    it('debe retornar false si el ID no existe', () => {
      const deleted = deleteCredential('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('no debe afectar otras credenciales', () => {
      const cred1 = createMockSupabaseCredential();
      const cred2 = createMockGoogleServiceAccountCredential();
      
      saveCredential(cred1);
      saveCredential(cred2);
      
      deleteCredential(cred1.id);
      
      const all = getAllCredentials();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(cred2.id);
    });
  });

  describe('validateCredential', () => {
    it('debe validar credencial Supabase correcta', () => {
      const credential = createMockSupabaseCredential();
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('debe detectar Supabase sin URL', () => {
      const credential = createMockSupabaseCredential();
      (credential as any).data.url = '';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Supabase URL is required');
    });

    it('debe detectar Supabase sin key', () => {
      const credential = createMockSupabaseCredential();
      (credential as any).data.key = '';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Supabase key is required');
    });

    it('debe detectar URL inválida en Supabase', () => {
      const credential = createMockSupabaseCredential();
      (credential as any).data.url = 'not-a-url';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Supabase URL must be a valid URL');
    });

    it('debe validar Google Service Account correcta', () => {
      const credential = createMockGoogleServiceAccountCredential();
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('debe detectar Service Account sin private_key', () => {
      const credential = createMockGoogleServiceAccountCredential();
      (credential as any).data.private_key = '';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Service Account private_key is required');
    });

    it('debe detectar Service Account con type incorrecto', () => {
      const credential = createMockGoogleServiceAccountCredential();
      (credential as any).data.type = 'invalid_type';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('type: "service_account"'))).toBe(true);
    });

    it('debe detectar nombre vacío', () => {
      const credential = createMockSupabaseCredential();
      credential.name = '';
      
      const result = validateCredential(credential);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Credential name is required');
    });

    it('debe permitir Google OAuth sin refreshToken al crear', () => {
      const credential: Partial<Credential> = {
        id: 'cred-test',
        name: 'Test Google OAuth',
        type: 'google-oauth',
        data: {
          clientId: 'test-client-id',
          clientSecret: 'test-secret'
          // refreshToken omitido intencionalmente (se agregará después de autorizar)
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      const result = validateCredential(credential);
      
      // Debe ser válido incluso sin refreshToken
      expect(result.isValid).toBe(true);
    });
  });

  describe('mapToolTypeToCredentialType', () => {
    it('debe mapear gmail a credenciales de Google', () => {
      const types = mapToolTypeToCredentialType('gmail');
      
      expect(types).toContain('google-service-account');
      expect(types).toContain('google-oauth');
      expect(types).toContain('gmail-oauth');
      // Service Account debe ser primero (preferencia)
      expect(types[0]).toBe('google-service-account');
    });

    it('debe mapear google-calendar correctamente', () => {
      const types = mapToolTypeToCredentialType('google-calendar');
      
      expect(types).toContain('google-service-account');
      expect(types).toContain('google-oauth');
      expect(types).toContain('google-calendar-oauth');
    });

    it('debe mapear supabase a credencial de Supabase', () => {
      const types = mapToolTypeToCredentialType('supabase');
      
      expect(types).toEqual(['supabase']);
    });

    it('debe mapear google-sheets a credenciales de Google', () => {
      const types = mapToolTypeToCredentialType('google-sheets');
      
      expect(types).toContain('google-service-account');
      expect(types).toContain('google-oauth');
      expect(types).toContain('google-sheets-oauth');
    });

    it('debe retornar array vacío para tipo desconocido', () => {
      const types = mapToolTypeToCredentialType('unknown-tool');
      
      expect(types).toEqual([]);
    });

    it('debe mapear telegram correctamente', () => {
      const types = mapToolTypeToCredentialType('telegram');
      
      expect(types).toEqual(['telegram-bot']);
    });
  });

  describe('getCredentialTypeLabel', () => {
    it('debe retornar label legible para Supabase', () => {
      const label = getCredentialTypeLabel('supabase');
      expect(label).toBe('Supabase');
    });

    it('debe retornar label para Google Service Account', () => {
      const label = getCredentialTypeLabel('google-service-account');
      expect(label).toBe('Google (Service Account)');
    });

    it('debe retornar label para Google OAuth', () => {
      const label = getCredentialTypeLabel('google-oauth');
      expect(label).toBe('Google (OAuth)');
    });

    it('debe retornar label para Gmail OAuth (legacy)', () => {
      const label = getCredentialTypeLabel('gmail-oauth');
      expect(label).toBe('Gmail (OAuth)');
    });

    it('debe retornar label para SMTP', () => {
      const label = getCredentialTypeLabel('smtp');
      expect(label).toBe('SMTP Email');
    });

    it('debe retornar el tipo original si no hay label', () => {
      const label = getCredentialTypeLabel('custom-type' as any);
      expect(label).toBe('custom-type');
    });
  });

  describe('Integración con localStorage', () => {
    it('debe persistir credenciales entre sesiones', () => {
      const credential = createMockSupabaseCredential();
      saveCredential(credential);
      
      // Simular recarga de la página creando nueva instancia
      const loaded = getAllCredentials();
      
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toEqual(credential);
    });

    it('debe manejar JSON corrupto en localStorage', () => {
      localStorage.setItem('silverfleet_credentials', '{invalid json}');
      
      const creds = getAllCredentials();
      expect(creds).toEqual([]); // Debe retornar array vacío sin errores
    });

    it('debe manejar múltiples tipos de credenciales', () => {
      const supabase = createMockSupabaseCredential();
      const google = createMockGoogleServiceAccountCredential();
      
      saveCredential(supabase);
      saveCredential(google);
      
      const all = getAllCredentials();
      expect(all).toHaveLength(2);
      
      const types = all.map(c => c.type);
      expect(types).toContain('supabase');
      expect(types).toContain('google-service-account');
    });
  });
});
