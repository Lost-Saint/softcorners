/**
 * @file Clips shadows for windows.
 *
 * Needed because of this issue:
 * https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/4474
 */

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {readShader} from '../utils/file.js';
import {hasLegacyShaderEffect} from './shader_compat.js';

const [declarations, code] = await readShader(
    import.meta.url,
    'shader/clip_shadow.frag',
);

let legacyClass: {new (): Clutter.Effect} | null = null;
let shaderClass: {new (): Clutter.Effect} | null = null;

/**
 * Create the shadow clipping effect for the running GNOME Shell version.
 * See shader_compat.ts for why the class is picked lazily.
 */
export function createClipShadowEffect(): Clutter.Effect {
    if (hasLegacyShaderEffect) {
        legacyClass ??= GObject.registerClass(
            {},
            class LegacyClipShadowEffect extends Shell.GLSLEffect {
                vfunc_build_pipeline() {
                    this.add_glsl_snippet(
                        Cogl.SnippetHook.FRAGMENT,
                        declarations,
                        code,
                        false,
                    );
                }
            },
        );
        return new legacyClass();
    }

    shaderClass ??= GObject.registerClass(
        {},
        class ShaderClipShadowEffect extends Clutter.ShaderEffect {
            vfunc_get_static_snippet() {
                return Cogl.Snippet.new(
                    Cogl.SnippetHook.FRAGMENT,
                    declarations,
                    code,
                );
            }
        },
    );
    return new shaderClass();
}
