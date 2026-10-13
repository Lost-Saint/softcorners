/**
 * @file Applies linear interpolation to a window. This is used to make windows
 * in the overview look better.
 */

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {hasLegacyShaderEffect} from './shader_compat.js';

/** Switch the offscreen pipeline to linear filtering while painting. */
function setLinearFiltering(effect: Clutter.OffscreenEffect) {
    effect
        .get_pipeline()
        ?.set_layer_filters(
            0,
            Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR,
            Cogl.PipelineFilter.LINEAR,
        );
}

let legacyClass: {new (): Clutter.Effect} | null = null;
let shaderClass: {new (): Clutter.Effect} | null = null;

/**
 * Create the linear filter effect for the running GNOME Shell version.
 * See shader_compat.ts for why the class is picked lazily.
 */
export function createLinearFilterEffect(): Clutter.Effect {
    if (hasLegacyShaderEffect) {
        legacyClass ??= GObject.registerClass(
            {},
            class LegacyLinearFilterEffect extends Shell.GLSLEffect {
                vfunc_build_pipeline() {
                    this.add_glsl_snippet(
                        Cogl.SnippetHook.FRAGMENT,
                        '',
                        '',
                        false,
                    );
                }

                vfunc_paint_target(
                    node: Clutter.PaintNode,
                    ctx: Clutter.PaintContext,
                ) {
                    setLinearFiltering(this);
                    super.vfunc_paint_target(node, ctx);
                }
            },
        );
        return new legacyClass();
    }

    shaderClass ??= GObject.registerClass(
        {},
        class ShaderLinearFilterEffect extends Clutter.ShaderEffect {
            vfunc_get_static_snippet() {
                return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, null, null);
            }

            vfunc_paint_target(
                node: Clutter.PaintNode,
                ctx: Clutter.PaintContext,
            ) {
                setLinearFiltering(this);
                super.vfunc_paint_target(node, ctx);
            }
        },
    );
    return new shaderClass();
}
