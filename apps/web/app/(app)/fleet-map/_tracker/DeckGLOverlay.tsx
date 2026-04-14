'use client';

import { useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { LayersList } from '@deck.gl/core';

interface DeckGLOverlayProps {
  layers: LayersList;

  onHover?: (info: any) => void;

  onClick?: (info: any) => void;
}

export function DeckGLOverlay({ layers, onHover, onClick }: DeckGLOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
    () =>
      new MapboxOverlay({
        layers,
        getTooltip: undefined,
      }),
  );

  overlay.setProps({ layers, onHover, onClick });

  return null;
}
