// Export a movie's assets for the port.
//   rr-extract <movie.dcr|cast.cct> <out dir>
//
// Writes into <out dir>:
//   index.json            stage size, labels, tempo, members, score sprites
//   bitmaps/<lib>-<n>.png every bitmap member (RGBA)
//   w3d/<name>.json       each Shockwave 3D member: nodes, shaders, materials,
//                         lights, textures and mesh layout
//   w3d/<name>.bin        mesh arrays (little-endian f32 / u32) referenced by the JSON
//   w3d/<name>/<tex>.*    texture images as stored (JPEG or PNG)

use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use vm_rust::director::chunks::Chunk;
use vm_rust::director::chunks::cast_member::CastMemberSpecificData;
use vm_rust::director::chunks::w3d::types::{W3dLightType, W3dNodeType, W3dScene};
use vm_rust::director::enums::MemberType;
use vm_rust::director::file::read_director_file_bytes;
use vm_rust::player::bitmap::palette_map::PaletteMap;
use vm_rust::player::cast_member::PaletteMember;
use vm_rust::player::score::Score;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: rr-extract <movie> <out dir>");
        std::process::exit(2);
    }
    let movie = PathBuf::from(&args[1]);
    let out = PathBuf::from(&args[2]);
    fs::create_dir_all(out.join("bitmaps")).unwrap();
    fs::create_dir_all(out.join("w3d")).unwrap();

    // Score parsing evaluates behavior parameters with the Lingo evaluator, which
    // needs the global player; the native test harness sets one up.
    let _player = vm_rust::player::testing::TestPlayer::new();
    let bytes = fs::read(&movie).expect("read movie");
    let file_name = movie.file_name().unwrap().to_string_lossy().to_string();
    let file = read_director_file_bytes(&bytes, &file_name, "http://local/").expect("parse movie");

    // Palettes, keyed the way the player keys them (cast slot numbers).
    let mut palettes = PaletteMap::new();
    for (i, cast) in file.casts.iter().enumerate() {
        for (num, def) in &cast.members {
            if !matches!(def.chunk.member_type, MemberType::Palette) {
                continue;
            }
            if let Some(p) = def.children.iter().find_map(|c| c.as_ref().and_then(|c| c.as_palette())) {
                let slot = ((i as u32) << 16) | (num & 0xFFFF);
                palettes.insert(slot, PaletteMember { colors: p.colors.clone() });
            }
        }
    }

    let mut members = vec![];
    for (i, cast) in file.casts.iter().enumerate() {
        let lib = i as u32 + 1;
        let mut nums: Vec<_> = cast.members.keys().copied().collect();
        nums.sort();
        for num in nums {
            let def = &cast.members[&num];
            let name = def.chunk.member_info.as_ref().map(|i| i.name.clone()).unwrap_or_default();
            let mut entry = json!({
                "lib": lib, "num": num, "name": name,
                "type": format!("{:?}", def.chunk.member_type),
            });
            match &def.chunk.specific_data {
                CastMemberSpecificData::Bitmap(info) => {
                    entry["width"] = json!(info.width);
                    entry["height"] = json!(info.height);
                    entry["reg"] = json!([info.reg_x, info.reg_y]);
                    entry["depth"] = json!(info.bit_depth);
                    entry["useAlpha"] = json!(info.use_alpha);
                    let png = out.join(format!("bitmaps/{}-{}.png", lib, num));
                    let bitd = def.children.iter().find_map(|c| c.as_ref().and_then(|c| c.as_bitmap()));
                    // Some 32-bit members keep a JPEG in a media chunk (and alpha in a raw one) instead.
                    let jpeg = def.children.iter().find_map(|c| match c {
                        Some(Chunk::Media(m)) if m.audio_data.starts_with(&[0xFF, 0xD8, 0xFF]) => Some(&m.audio_data),
                        _ => None,
                    });
                    let result = if let Some(bitd) = bitd {
                        Some(export_bitmap(&bitd.data, info, lib, bitd.version, &palettes, &png))
                    } else if let Some(jpeg) = jpeg {
                        let alfa = def.children.iter().find_map(|c| match c {
                            Some(Chunk::Raw(d)) if !d.is_empty() => Some(d),
                            _ => None,
                        });
                        Some(export_jpeg_bitmap(jpeg, info, alfa, &palettes, &png))
                    } else {
                        None
                    };
                    match result {
                        Some(Ok(())) => entry["png"] = json!(format!("bitmaps/{}-{}.png", lib, num)),
                        Some(Err(e)) => entry["error"] = json!(e),
                        None => {}
                    }
                }
                _ => {}
            }
            // Shockwave 3D members are Xtra members (read as type Ole); find them by
            // their W3D payload.
            {
                let w3d = def.children.iter().filter_map(|c| c.as_ref()).find_map(|c| match c {
                    Chunk::XMedia(xm) if xm.raw_data.starts_with(b"3DEM") => Some(xm.raw_data.clone()),
                    _ => None,
                });
                if let Some(w3d) = w3d {
                    match vm_rust::director::chunks::w3d::parse_w3d(&w3d) {
                        Ok(scene) => {
                            let base = safe_name(&name);
                            export_scene(&scene, &out.join("w3d"), &base);
                            entry["w3d"] = json!(format!("w3d/{}.json", base));
                        }
                        Err(e) => entry["error"] = json!(e),
                    }
                }
            }
            members.push(entry);
        }
    }

    let mut index = json!({
        "file": file_name,
        "stage": [file.config.movie_left, file.config.movie_top, file.config.movie_right, file.config.movie_bottom],
        "members": members,
    });
    if let Some(labels) = &file.frame_labels {
        index["labels"] = labels.labels.iter().map(|l| json!([l.frame_num, l.label])).collect();
    }
    if let Some(chunk) = file.score.as_ref() {
        let mut score = Score::empty();
        score.load_from_score_chunk(chunk, file.version);
        index["frameCount"] = json!(score.frame_count);
        index["tempo"] = score
            .tempo_channel_data
            .iter()
            .map(|(f, t)| json!({"frame": f, "tempo": t.tempo, "cue": t.tempo_cue_point}))
            .collect();
        index["spans"] = score
            .sprite_spans
            .iter()
            .map(|s| {
                json!({
                    "channel": s.channel_number, "start": s.start_frame, "end": s.end_frame,
                    "scripts": s.scripts.iter().map(|r| json!([r.cast_lib, r.cast_member])).collect::<Vec<_>>(),
                })
            })
            .collect();
        index["sprites"] = score
            .channel_initialization_data
            .iter()
            .map(|(frame, channel, d)| {
                json!({
                    "frame": frame + 1, "channel": channel, "member": [d.cast_lib, d.cast_member],
                    "loc": [d.pos_x, d.pos_y], "size": [d.width, d.height], "ink": d.ink,
                    "blend": d.blend, "stretch": d.stretch, "type": d.sprite_type, "rotation": d.rotation, "skew": d.skew,
                    "fore": [d.fore_color, d.fore_color_g, d.fore_color_b],
                    "back": [d.back_color, d.back_color_g, d.back_color_b], "colorFlag": d.color_flag,
                })
            })
            .collect();
    }
    fs::write(out.join("index.json"), serde_json::to_string_pretty(&index).unwrap()).unwrap();
    eprintln!("{}: {} members", file_name, index["members"].as_array().unwrap().len());
}

fn safe_name(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    if s.is_empty() { "unnamed".into() } else { s }
}

fn export_bitmap(
    data: &[u8],
    info: &vm_rust::director::enums::BitmapInfo,
    lib: u32,
    version: u16,
    palettes: &PaletteMap,
    path: &Path,
) -> Result<(), String> {
    let mut bmp = vm_rust::player::bitmap::bitmap::decompress_bitmap(data, info, lib, version)?;
    bmp.use_alpha = info.use_alpha;
    let (w, h) = (bmp.width as u32, bmp.height as u32);
    if w == 0 || h == 0 {
        return Err("empty".into());
    }
    let mut rgba = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let (r, g, b, a) = bmp.get_pixel_color_with_alpha(palettes, x as u16, y as u16);
            let a = if bmp.bit_depth == 32 && !info.use_alpha { 255 } else { a };
            rgba.put_pixel(x, y, image::Rgba([r, g, b, a]));
        }
    }
    rgba.save(path).map_err(|e| e.to_string())
}

fn export_jpeg_bitmap(
    data: &[u8],
    info: &vm_rust::director::enums::BitmapInfo,
    alfa: Option<&Vec<u8>>,
    palettes: &PaletteMap,
    path: &Path,
) -> Result<(), String> {
    let bmp = vm_rust::player::bitmap::bitmap::decode_jpeg_bitmap(data, info, alfa)?;
    let (w, h) = (bmp.width as u32, bmp.height as u32);
    let mut rgba = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let (r, g, b, a) = bmp.get_pixel_color_with_alpha(palettes, x as u16, y as u16);
            rgba.put_pixel(x, y, image::Rgba([r, g, b, if info.use_alpha { a } else { 255 }]));
        }
    }
    rgba.save(path).map_err(|e| e.to_string())
}

struct Bin(Vec<u8>);

impl Bin {
    fn f32s(&mut self, v: impl IntoIterator<Item = f32>) -> Value {
        let start = self.0.len();
        let mut n = 0;
        for x in v {
            self.0.extend_from_slice(&x.to_le_bytes());
            n += 1;
        }
        json!([start, n])
    }
    fn u32s(&mut self, v: impl IntoIterator<Item = u32>) -> Value {
        let start = self.0.len();
        let mut n = 0;
        for x in v {
            self.0.extend_from_slice(&x.to_le_bytes());
            n += 1;
        }
        json!([start, n])
    }
}

fn export_scene(scene: &W3dScene, dir: &Path, base: &str) {
    let mut bin = Bin(vec![]);
    let tex_dir = dir.join(base);
    fs::create_dir_all(&tex_dir).unwrap();

    let mut textures = BTreeMap::new();
    for (name, data) in &scene.texture_images {
        if data.is_empty() {
            continue;
        }
        let file = format!("{}.png", safe_name(name.as_str()));
        match decode_texture(data) {
            Some(img) => {
                let alpha = img.pixels().any(|p| p.0[3] < 255);
                img.save(tex_dir.join(&file)).unwrap();
                textures.insert(name.to_string(), json!({"file": format!("{}/{}", base, file), "alpha": alpha}));
            }
            None => eprintln!("texture {}: could not decode", name),
        }
    }

    let nodes: Vec<Value> = scene
        .nodes
        .iter()
        .map(|n| {
            json!({
                "name": n.name.to_string(), "parent": n.parent_name.to_string(),
                "type": match n.node_type { W3dNodeType::Group => "group", W3dNodeType::Model => "model", W3dNodeType::Light => "light", W3dNodeType::View => "view" },
                "resource": n.resource_name.to_string(), "modelResource": n.model_resource_name.to_string(),
                "shader": n.shader_name.to_string(), "visibility": n.visibility,
                "transform": n.transform.to_vec(),
                "near": n.near_plane, "far": n.far_plane, "fov": n.fov, "ortho": n.projection_ortho,
            })
        })
        .collect();

    let shaders: Vec<Value> = scene
        .shaders
        .iter()
        .map(|s| {
            json!({
                "name": s.name.to_string(), "material": s.material_name.to_string(),
                "attrs": s.attrs, "type": format!("{:?}", s.shader_type), "flat": s.flat,
                "layers": s.texture_layers.iter().map(|l| json!({
                    "texture": l.name.to_string(), "intensity": l.intensity, "blendFunc": l.blend_func,
                    "blendSrc": l.blend_src, "blendConst": l.blend_const, "mode": l.tex_mode,
                    "texTransform": l.tex_transform.to_vec(), "wrapTransform": l.wrap_transform.to_vec(),
                    "repeat": [l.repeat_s, l.repeat_t],
                })).collect::<Vec<_>>(),
            })
        })
        .collect();

    let materials: Vec<Value> = scene
        .materials
        .iter()
        .map(|m| {
            json!({
                "name": m.name.to_string(), "ambient": m.ambient.to_vec(), "diffuse": m.diffuse.to_vec(),
                "specular": m.specular.to_vec(), "emissive": m.emissive.to_vec(),
                "reflectivity": m.reflectivity, "opacity": m.opacity, "shininess": m.shininess,
            })
        })
        .collect();

    let lights: Vec<Value> = scene
        .lights
        .iter()
        .map(|l| {
            json!({
                "name": l.name.to_string(),
                "type": match l.light_type { W3dLightType::Ambient => "ambient", W3dLightType::Directional => "directional", W3dLightType::Point => "point", W3dLightType::Spot => "spot" },
                "color": l.color.to_vec(), "attenuation": l.attenuation.to_vec(), "spotAngle": l.spot_angle,
                "enabled": l.enabled, "specular": l.specular, "spotDecay": l.spot_decay,
            })
        })
        .collect();

    let mut resources = BTreeMap::new();
    let mut names: Vec<_> = scene.clod_meshes.keys().copied().collect();
    names.sort_by_key(|n| n.to_string());
    for res in names {
        let info = scene.model_resources.get(&res);
        let meshes: Vec<Value> = scene.clod_meshes[&res]
            .iter()
            .enumerate()
            .map(|(i, m)| {
                // The shader this submesh is bound to, as the resource authored it.
                let binding = info.and_then(|r| {
                    r.shader_bindings.iter().find_map(|b| {
                        b.mesh_bindings.get(i).filter(|s| !s.is_empty()).map(|s| s.to_string())
                    })
                });
                json!({
                    "shader": binding,
                    "positions": bin.f32s(m.positions.iter().flatten().copied()),
                    "normals": bin.f32s(m.normals.iter().flatten().copied()),
                    "uvs": m.tex_coords.iter().map(|layer| bin.f32s(layer.iter().flatten().copied())).collect::<Vec<_>>(),
                    "colors": if m.diffuse_colors.is_empty() { Value::Null } else { bin.f32s(m.diffuse_colors.iter().flatten().copied()) },
                    "faces": bin.u32s(m.faces.iter().flatten().copied()),
                })
            })
            .collect();
        resources.insert(
            res.to_string(),
            json!({
                "meshes": meshes,
                "uvGen": info.and_then(|r| r.uv_gen_mode),
                "bindings": info.map(|r| r.shader_bindings.iter().map(|b| json!({
                    "name": b.name.to_string(),
                    "meshes": b.mesh_bindings.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
                })).collect::<Vec<_>>()),
            }),
        );
    }
    for m in &scene.raw_meshes {
        resources.insert(
            m.name.to_string(),
            json!({
                "raw": true,
                "meshes": [{
                    "shader": Value::Null,
                    "positions": bin.f32s(m.positions.iter().flatten().copied()),
                    "normals": bin.f32s(m.normals.iter().flatten().copied()),
                    "uvs": [bin.f32s(m.tex_coords.iter().flatten().copied())],
                    "colors": if m.vertex_colors.is_empty() { Value::Null } else { bin.f32s(m.vertex_colors.iter().flatten().copied()) },
                    "faces": bin.u32s(m.faces.iter().flatten().copied()),
                }],
            }),
        );
    }

    let doc = json!({
        "bin": format!("{}.bin", base),
        "nodes": nodes, "shaders": shaders, "materials": materials, "lights": lights,
        "textures": textures, "resources": resources,
        "textureInfo": scene.texture_infos.iter().map(|t| json!({
            "name": t.name.to_string(), "renderFormat": t.render_format, "mipMode": t.mip_mode,
            "magFilter": t.mag_filter, "imageType": t.image_type,
        })).collect::<Vec<_>>(),
        "skeletons": scene.skeletons.iter().map(|s| json!({"name": s.name.to_string(), "bones": s.bones.len()})).collect::<Vec<_>>(),
        "motions": scene.motions.len(),
    });
    fs::write(dir.join(format!("{}.json", base)), serde_json::to_string(&doc).unwrap()).unwrap();
    fs::write(dir.join(format!("{}.bin", base)), &bin.0).unwrap();
}

/// A W3D texture as RGBA. Textures with alpha are stored as an RGB JPEG followed by
/// [width u32][height u32][zlib length u32][zlib 8-bit alpha, rows bottom-up].
fn decode_texture(data: &[u8]) -> Option<image::RgbaImage> {
    use std::io::Read;
    let mut img = image::load_from_memory(data).ok()?.to_rgba8();
    if !data.starts_with(&[0xFF, 0xD8]) {
        return Some(img);
    }
    let eoi = data.windows(2).position(|b| b == [0xFF, 0xD9])?;
    let tail = &data[eoi + 2..];
    if tail.len() < 14 {
        return Some(img);
    }
    let le = |i: usize| u32::from_le_bytes([tail[i], tail[i + 1], tail[i + 2], tail[i + 3]]);
    let (w, h, len) = (le(0), le(4), le(8) as usize);
    if w != img.width() || h != img.height() || tail[12] != 0x78 || tail.len() < 12 + len {
        return Some(img);
    }
    let mut alpha = vec![];
    flate2::read::ZlibDecoder::new(&tail[12..12 + len]).read_to_end(&mut alpha).ok()?;
    if alpha.len() < (w * h) as usize {
        return Some(img);
    }
    for y in 0..h {
        for x in 0..w {
            img.get_pixel_mut(x, y).0[3] = alpha[((h - 1 - y) * w + x) as usize];
        }
    }
    Some(img)
}
