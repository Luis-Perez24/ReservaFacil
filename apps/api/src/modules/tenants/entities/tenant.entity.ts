import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface TeamMember {
  name: string;
  role: string;
  photoUrl: string | null;
}

/**
 * Toda la personalización de la página pública en un jsonb: identidad visual y
 * contenido de las secciones. jsonb (no columnas) para sumar campos sin migrar.
 */
export interface TenantBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  /** URL de la imagen de portada (storage externo). Opcional por negocio. */
  coverImageUrl: string | null;
  tagline: string | null;
  about: string | null;
  team: TeamMember[] | null;
  address: string | null;
  hours: string | null;
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  /** Único global: es la URL pública del negocio. */
  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text', default: 'America/Santiago' })
  timezone!: string;

  @Column({ type: 'jsonb', nullable: true })
  branding!: TenantBranding | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
