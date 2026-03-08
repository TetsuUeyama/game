// Model registry: lists available voxel models for bone-config and fbx-viewer
export interface ModelEntry {
  id: string;           // unique identifier
  label: string;        // display name
  dir: string;          // directory under /public (e.g., "box5")
  bodyFile: string;     // body .vox file path (absolute from public)
  partsManifest: string; // parts.json path (absolute from public)
  bodyKey: string;      // key in parts.json that identifies the body
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: 'vagrant',
    label: 'Vagrant',
    dir: 'box5',
    bodyFile: '/box5/vagrant_rig_vagrant_body.vox',
    partsManifest: '/box5/vagrant_rig_parts.json',
    bodyKey: 'vagrant_body',
  },
  {
    id: 'cyberpunk_elf',
    label: 'Cyberpunk Elf',
    dir: 'box2',
    bodyFile: '/box2/cyberpunk_elf_body_base.vox',
    partsManifest: '/box2/cyberpunk_elf_parts.json',
    bodyKey: 'body',
  },
];

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find(m => m.id === id);
}

export const DEFAULT_MODEL_ID = 'vagrant';
