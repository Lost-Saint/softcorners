/** @file Binds the actual corner rounding shader to the windows. */

import type {Bounds, RoundedCornerSettings} from '../utils/types.js';

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import {readShader} from '../utils/file.js';
import {getPref} from '../utils/settings.js';
import {hasLegacyShaderEffect} from './shader_compat.js';

const [declarations, code] = await readShader(
    import.meta.url,
    'shader/rounded_corners.frag',
);

/** Public handle: the GNOME 50 and 51 implementations are interchangeable. */
export type RoundedCornersEffect = Clutter.Effect & {
    updateUniforms: (
        config: RoundedCornerSettings,
        windowBounds: Bounds,
    ) => void;
};

/** Computed value for every shader uniform. */
type UniformValues = {
    bounds: [number, number, number, number];
    clipRadius: number;
    borderWidth: number;
    borderColor: [number, number, number, number];
    borderedAreaBounds: [number, number, number, number];
    borderedAreaClipRadius: number;
    pixelStep: [number, number];
    exponent: number;
};

/**
 * Compute all shader uniforms. Returns null when the actor has no size yet
 * (before first allocation, during animations); the caller skips the update
 * and a size change triggers a refresh.
 *
 * @param config - Rounded corners configuration
 * @param windowBounds - Bounds of the window without padding
 * @param actorWidth - Width of the actor the effect is attached to
 * @param actorHeight - Height of the actor the effect is attached to
 */
function computeUniforms(
    config: RoundedCornerSettings,
    windowBounds: Bounds,
    actorWidth: number,
    actorHeight: number,
): UniformValues | null {
    if (actorWidth <= 0 || actorHeight <= 0) {
        // Without this, pixelStep becomes Infinity and poisons the uniforms.
        return null;
    }

    const borderWidth = getPref('border-width');
    const borderColor = config.borderColor;

    const outerRadius = config.borderRadius;
    const {padding, smoothing} = config;

    const bounds: [number, number, number, number] = [
        windowBounds.x1 + padding.left,
        windowBounds.y1 + padding.top,
        windowBounds.x2 - padding.right,
        windowBounds.y2 - padding.bottom,
    ];

    const borderedAreaBounds: [number, number, number, number] = [
        bounds[0] + borderWidth,
        bounds[1] + borderWidth,
        bounds[2] - borderWidth,
        bounds[3] - borderWidth,
    ];

    let borderedAreaRadius = outerRadius - borderWidth;
    if (borderedAreaRadius < 0.001) {
        borderedAreaRadius = 0.0;
    }

    const pixelStep: [number, number] = [1 / actorWidth, 1 / actorHeight];

    // This is needed for squircle corners
    let exponent = smoothing * 10 + 2;
    let radius = outerRadius * 0.5 * exponent;
    // Clamp the radius so small windows (PiP, popups, overview thumbnails)
    // don't get a radius larger than the window itself.
    // Note: bounds is [x1, y1, x2, y2], so width is [2] - [0].
    const maxRadius = Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]);
    if (outerRadius > 0 && radius > maxRadius) {
        exponent *= maxRadius / radius;
        radius = maxRadius;
    }
    if (outerRadius > 0) {
        borderedAreaRadius *= radius / outerRadius;
    } else {
        borderedAreaRadius = 0;
    }

    return {
        bounds,
        clipRadius: radius,
        borderWidth,
        borderColor,
        borderedAreaBounds,
        borderedAreaClipRadius: borderedAreaRadius,
        pixelStep,
        exponent,
    };
}

/** Uniform names, matching the declarations in the shader file. */
const UNIFORM_NAMES = [
    'bounds',
    'clipRadius',
    'borderWidth',
    'borderColor',
    'borderedAreaBounds',
    'borderedAreaClipRadius',
    'exponent',
    'pixelStep',
] as const;

class UniformLocations {
    bounds = 0;
    clipRadius = 0;
    borderWidth = 0;
    borderColor = 0;
    borderedAreaBounds = 0;
    borderedAreaClipRadius = 0;
    exponent = 0;
    pixelStep = 0;
}

let legacyClass: {new (): RoundedCornersEffect} | null = null;
let shaderClass: {new (): RoundedCornersEffect} | null = null;

/** GNOME 50 implementation, backed by Shell.GLSLEffect. */
function getLegacyClass(): {new (): RoundedCornersEffect} {
    legacyClass ??= GObject.registerClass(
        {},
        class LegacyRoundedCornersEffect extends Shell.GLSLEffect {
            /**
             * To store a uniform value, we need to know its location in the
             * shader, which is done by calling `this.get_uniform_location()`.
             * This is expensive, so we cache the location of uniforms when
             * the shader is created.
             */
            static locations: UniformLocations = new UniformLocations();

            constructor() {
                super();

                for (const name of UNIFORM_NAMES) {
                    LegacyRoundedCornersEffect.locations[name] =
                        this.get_uniform_location(name);
                }
            }

            vfunc_build_pipeline() {
                this.add_glsl_snippet(
                    Cogl.SnippetHook.FRAGMENT,
                    declarations,
                    code,
                    false,
                );
            }

            /**
             * Update uniforms of the shader.
             * For more information, see the comments in the shader file.
             *
             * @param config - Rounded corners configuration
             * @param windowBounds - Bounds of the window without padding
             */
            updateUniforms(
                config: RoundedCornerSettings,
                windowBounds: Bounds,
            ) {
                const values = computeUniforms(
                    config,
                    windowBounds,
                    this.actor.get_width(),
                    this.actor.get_height(),
                );
                if (!values) {
                    return;
                }

                const locations = LegacyRoundedCornersEffect.locations;
                this.set_uniform_float(locations.bounds, 4, values.bounds);
                this.set_uniform_float(locations.clipRadius, 1, [
                    values.clipRadius,
                ]);
                this.set_uniform_float(locations.borderWidth, 1, [
                    values.borderWidth,
                ]);
                this.set_uniform_float(
                    locations.borderColor,
                    4,
                    values.borderColor,
                );
                this.set_uniform_float(
                    locations.borderedAreaBounds,
                    4,
                    values.borderedAreaBounds,
                );
                this.set_uniform_float(locations.borderedAreaClipRadius, 1, [
                    values.borderedAreaClipRadius,
                ]);
                this.set_uniform_float(
                    locations.pixelStep,
                    2,
                    values.pixelStep,
                );
                this.set_uniform_float(locations.exponent, 1, [
                    values.exponent,
                ]);
                this.queue_repaint();
            }
        },
    );
    return legacyClass;
}

/** GNOME 51 implementation, backed by Clutter.ShaderEffect. */
function getShaderClass(): {new (): RoundedCornersEffect} {
    shaderClass ??= GObject.registerClass(
        {},
        class ShaderRoundedCornersEffect extends Clutter.ShaderEffect {
            // GNOME 51 API, absent from the bundled 50-era types, so it is
            // declared (not cast) here. Signature matches the Clutter 51 GIR:
            // (name, n_components, value).
            // biome-ignore lint/style/useNamingConvention: name must match the Clutter 51 C API
            declare set_uniform_float: (
                name: string,
                nComponents: number,
                value: number[],
            ) => void;

            vfunc_get_static_snippet() {
                // Post, not replace: Cogl runs the generated texture sampling
                // into cogl_color_out first, then this code tweaks the color.
                return Cogl.Snippet.new(
                    Cogl.SnippetHook.FRAGMENT,
                    declarations,
                    code,
                );
            }

            /**
             * Update uniforms of the shader.
             * For more information, see the comments in the shader file.
             *
             * @param config - Rounded corners configuration
             * @param windowBounds - Bounds of the window without padding
             */
            updateUniforms(
                config: RoundedCornerSettings,
                windowBounds: Bounds,
            ) {
                const values = computeUniforms(
                    config,
                    windowBounds,
                    this.actor.get_width(),
                    this.actor.get_height(),
                );
                if (!values) {
                    return;
                }

                this.set_uniform_float('bounds', 4, values.bounds);
                this.set_uniform_float('clipRadius', 1, [values.clipRadius]);
                this.set_uniform_float('borderWidth', 1, [values.borderWidth]);
                this.set_uniform_float('borderColor', 4, values.borderColor);
                this.set_uniform_float(
                    'borderedAreaBounds',
                    4,
                    values.borderedAreaBounds,
                );
                this.set_uniform_float('borderedAreaClipRadius', 1, [
                    values.borderedAreaClipRadius,
                ]);
                this.set_uniform_float('pixelStep', 2, values.pixelStep);
                this.set_uniform_float('exponent', 1, [values.exponent]);
                this.queue_repaint();
            }
        },
    );
    return shaderClass;
}

/**
 * Create the corner rounding effect for the running GNOME Shell version.
 * The class is picked lazily so merely importing this module never touches
 * the removed Shell.GLSLEffect on GNOME 51.
 */
export function createRoundedCornersEffect(): RoundedCornersEffect {
    return hasLegacyShaderEffect
        ? new (getLegacyClass())()
        : new (getShaderClass())();
}
