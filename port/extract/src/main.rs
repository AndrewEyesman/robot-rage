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
    fs::create_dir_all(out.join("fonts")).unwrap();
    fs::create_dir_all(out.join("sounds")).unwrap();

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
                    // Indexed bitmaps name their palette (a member number, or < 0 for a
                    // built-in one); the runtime keeps their pixels as indices into it.
                    if info.bit_depth <= 8 && info.palette_id != 0 {
                        entry["paletteId"] = json!(info.palette_id);
                        entry["clutCastLib"] = json!(info.clut_cast_lib);
                    }
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
                CastMemberSpecificData::Field(f) => {
                    entry["field"] = field_json(f, def, &file.font_table);
                }
                _ => {}
            }
            // Buttons are fields with a button type; shapes (raw type 8, read as Flash).
            let raw = &def.chunk.specific_data_raw;
            if matches!(def.chunk.member_type, MemberType::Button) && raw.len() >= 28 {
                let f = vm_rust::director::enums::FieldInfo::from(raw.as_slice());
                let mut j = field_json(&f, def, &file.font_table);
                j["buttonType"] = json!(if raw.len() >= 30 { u16::from_be_bytes([raw[28], raw[29]]) } else { 0 });
                entry["field"] = j;
            }
            if matches!(def.chunk.member_type, MemberType::Flash | MemberType::Shape) && raw.len() >= 17 {
                let be = |i: usize| i16::from_be_bytes([raw[i], raw[i + 1]]);
                entry["shape"] = json!({
                    "shapeType": be(0), "rect": [be(4), be(2), be(8), be(6)], "pattern": be(10),
                    "fore": raw[12], "back": raw[13], "filled": raw[14], "lineSize": raw[15], "lineDirection": raw[16],
                });
                entry["type"] = json!("Shape");
            }
            if let CastMemberSpecificData::FilmLoop(fl) = &def.chunk.specific_data {
                entry["filmLoop"] = json!({ "reg": [fl.reg_point.0, fl.reg_point.1], "size": [fl.width, fl.height] });
            }
            if matches!(def.chunk.member_type, MemberType::Palette) {
                if let Some(p) = def.children.iter().find_map(|c| c.as_ref().and_then(|c| c.as_palette())) {
                    entry["palette"] = json!(p.colors.iter().map(|c| format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)).collect::<Vec<_>>());
                }
            }
            let is_sound = matches!(def.chunk.member_type, MemberType::Sound);
            let swa = def.children.iter().flatten().filter(|_| is_sound).find_map(|c| match c {
                Chunk::Media(m) if m.is_compressed && !m.audio_data.is_empty() => Some(m),
                _ => None,
            });
            // The member's Loop checkbox: Director loops the sound unless bit 0x10 of the
            // member info's flags is set (as dirplayer and ScummVM read it).
            let looped = def.chunk.member_info.as_ref().is_some_and(|i| i.header.flags & 0x10 == 0);
            if let Some(m) = swa {
                // Shockwave Audio: an MP3 stream, possibly after a few header bytes.
                let data = &m.audio_data;
                let start = (0..data.len().saturating_sub(1).min(4096))
                    .find(|&i| data[i] == 0xFF && data[i + 1] & 0xE0 == 0xE0)
                    .unwrap_or(0);
                let file = format!("sounds/{}-{}.mp3", lib, num);
                fs::write(out.join(&file), &data[start..]).unwrap();
                entry["sound"] = json!({ "file": file, "codec": "swa", "rate": m.sample_rate, "loop": looped });
            } else if let Some(snd) = sound_of(def).filter(|_| is_sound) {
                let mp3 = snd.codec() == "mp3";
                let file = format!("sounds/{}-{}.{}", lib, num, if mp3 { "mp3" } else { "wav" });
                fs::write(out.join(&file), if mp3 { snd.data() } else { snd.to_wav() }).unwrap();
                let cues = def.children.iter().find_map(|c| match c {
                    Some(Chunk::CuePoints(c)) => Some(c.times_ms.clone()),
                    _ => None,
                });
                entry["sound"] = json!({
                    "file": file, "codec": snd.codec(), "rate": snd.sample_rate(),
                    "channels": snd.channels(), "bits": snd.bits_per_sample(), "cuePoints": cues, "loop": looped,
                });
            }
            for xm in def.children.iter().filter_map(|c| match c {
                Some(Chunk::XMedia(x)) => Some(x),
                _ => None,
            }) {
                if xm.is_pfr_font() {
                    if let Some(pfr) = xm.parse_pfr_font() {
                        entry["font"] = export_font(&pfr, &out.join("fonts"), &name);
                    }
                } else if let Some(t) = xm.parse_styled_text() {
                    // The member's box (Adobe's member.rect) is in the Text Xtra's
                    // properties: height, then width, as u32s at 48 and 52 of "text"'s data.
                    let raw = &def.chunk.specific_data_raw;
                    let be32 = |i: usize| u32::from_be_bytes([raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]) as i64;
                    let (width, height) = if raw.starts_with(b"\0\0\0\x04text") && raw.len() >= 56 {
                        (be32(52), be32(48))
                    } else {
                        (t.width as i64, t.height as i64)
                    };
                    entry["text"] = json!({
                        "text": t.text,
                        "alignment": format!("{:?}", t.alignment),
                        "wordWrap": t.word_wrap,
                        "fixedLineSpace": t.fixed_line_space,
                        "size": [width, height],
                        "defaultFont": t.default_font_name, "defaultSize": t.default_font_size,
                        "defaultColor": t.default_fore_color.map(|c| format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)),
                        "bg": t.bg_color.map(|c| format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)),
                        "paragraphs": t.par_infos.iter().map(|p| json!({
                            "lineSpacing": p.line_spacing, "lineHeight": p.line_height, "leftIndent": p.left_indent,
                            "rightIndent": p.right_indent, "firstIndent": p.first_indent, "topSpacing": p.top_spacing,
                            "bottomSpacing": p.bottom_spacing, "justification": p.justification,
                            "tabs": p.tabs.iter().map(|t| json!([t.0, t.1])).collect::<Vec<_>>(),
                        })).collect::<Vec<_>>(),
                        "paragraphRuns": t.par_runs.iter().map(|r| json!([r.position, r.par_info_index])).collect::<Vec<_>>(),
                        "spans": t.styled_spans.iter().map(|sp| json!({
                            "text": sp.text,
                            "font": sp.style.font_face,
                            "size": sp.style.font_size,
                            "color": sp.style.color.map(|c| format!("#{:06x}", c)),
                            "bold": sp.style.bold,
                            "italic": sp.style.italic,
                            "underline": sp.style.underline,
                        })).collect::<Vec<_>>(),
                    });
                }
            }
            // Shockwave 3D members are Xtra members (read as type Ole); find them by
            // their W3D payload.
            {
                let w3d = def.children.iter().filter_map(|c| c.as_ref()).find_map(|c| match c {
                    Chunk::XMedia(xm) if xm.raw_data.starts_with(b"3DEM") => Some(xm.raw_data.clone()),
                    _ => None,
                });
                // A Shockwave 3D member authored empty (no W3D media, only the Xtra's
                // properties): the garage's previews, filled in by scripts.
                if w3d.is_none() && def.chunk.specific_data_raw.starts_with(b"\0\0\0\x0bshockwave3d") {
                    let base = safe_name(&name);
                    export_empty_world(&out.join("w3d"), &base);
                    entry["w3d"] = json!(format!("w3d/{}.json", base));
                }
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
        "frameRate": file.config.frame_rate,
        "stageColor": [file.config.d7_stage_color_r, file.config.d7_stage_color_g, file.config.d7_stage_color_b],
        "castLibs": file.cast_entries.iter().map(|c| json!({"name": c.name, "file": c.file_path, "min": c.min_member, "max": c.max_member})).collect::<Vec<_>>(),
        "fonts": file.font_table.iter().map(|(k, v)| (k.to_string(), json!(v))).collect::<serde_json::Map<_, _>>(),
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
                    "params": s.scripts.iter().map(|r| vm_rust::player::reserve_player_ref(|p| {
                        r.parameter.iter().map(|d| vm_rust::player::datum_formatting::format_datum(d, p)).collect::<Vec<_>>()
                    })).collect::<Vec<_>>(),
                })
            })
            .collect();
        index["soundChannels"] = score
            .sound_channel_data
            .iter()
            .map(|(f, ch, d)| json!({"frame": f + 1, "channel": ch, "member": d.cast_member}))
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
                    "blendPct": blend_percent(d.blend, d.sprite_flags, file.version),
                    "flipH": d.flip_h(), "flipV": d.flip_v(), "editable": d.editable, "moveable": d.moveable, "trails": d.trails,
                })
            })
            .collect();
    }
    fs::write(out.join("index.json"), serde_json::to_string_pretty(&index).unwrap()).unwrap();
    eprintln!("{}: {} members", file_name, index["members"].as_array().unwrap().len());
}

/// A field's layout and its text with the formatting runs (fonts resolved by the
/// movie's font table).
fn field_json(f: &vm_rust::director::enums::FieldInfo, def: &vm_rust::director::chunks::cast_member::CastMemberDef, fonts: &std::collections::HashMap<u16, String>) -> Value {
    let stxt = def.children.iter().find_map(|c| match c {
        Some(Chunk::Text(t)) => Some(t),
        _ => None,
    });
    let runs = stxt.map(|t| t.parse_formatting_runs()).unwrap_or_default();
    json!({
        "text": stxt.map(|t| t.text.clone()).unwrap_or_default(),
        "border": f.border, "margin": f.margin, "boxShadow": f.box_drop_shadow, "boxType": f.box_type,
        "alignment": f.alignment, "bg": [f.bgpal_r >> 8, f.bgpal_g >> 8, f.bgpal_b >> 8], "scroll": f.scroll,
        "rect": [f.rect_left, f.rect_top, f.rect_right, f.rect_bottom], "maxHeight": f.max_height,
        "textShadow": f.text_shadow, "editable": f.flags & 1 != 0, "autoTab": f.flags & 2 != 0, "wordWrap": f.flags & 4 == 0,
        "textHeight": f.text_height,
        "runs": runs.iter().map(|r| json!({
            "start": r.start_position, "height": r.height, "ascent": r.ascent,
            "font": fonts.get(&r.font_id).cloned().unwrap_or_default(), "fontId": r.font_id,
            "style": r.style, "size": r.font_size,
            "color": format!("#{:02x}{:02x}{:02x}", r.color_r >> 8, r.color_g >> 8, r.color_b >> 8),
        })).collect::<Vec<_>>(),
    })
}

/// A sprite's blend as a percentage, as dirplayer reads it (score.rs convert_raw_blend):
/// in D6+ the byte only counts when the sprite's blend flag is set.
fn blend_percent(raw: u8, flags: u8, version: u16) -> i32 {
    if version >= 600 {
        if flags & 0x10 != 0 { ((255.0 - raw as f32) * 100.0 / 255.0).round() as i32 } else { 100 }
    } else if raw == 0 {
        100
    } else {
        (raw as i32).min(100)
    }
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

/// An embedded (PFR) font, rasterised by dirplayer at each size text is likely to use:
/// one glyph-grid PNG per size, white glyphs on transparent, with the advances.
fn export_font(pfr: &vm_rust::director::chunks::xmedia::PfrFont, dir: &Path, member_name: &str) -> Value {
    use vm_rust::director::chunks::pfr1::{parse_pfr1_font_with_target, rasterizer};
    let parsed = parse_pfr1_font_with_target(&pfr.raw_data, 0).unwrap_or_else(|_| pfr.parsed.clone());
    let base = safe_name(if member_name.is_empty() { &pfr.font_name } else { member_name });
    let mut sizes = serde_json::Map::new();
    for size in 6..=64usize {
        let r = rasterizer::rasterize_pfr1_font(&parsed, size, 0);
        if r.bitmap_width == 0 || r.bitmap_height == 0 {
            continue;
        }
        let Some(mut img) = image::RgbaImage::from_raw(r.bitmap_width as u32, r.bitmap_height as u32, r.bitmap_data.clone()) else { continue };
        for p in img.pixels_mut() {
            p.0[0] = 255;
            p.0[1] = 255;
            p.0[2] = 255;
        }
        let file = format!("fonts/{}-{}.png", base, size);
        img.save(dir.join(format!("{}-{}.png", base, size))).unwrap();
        sizes.insert(size.to_string(), json!({
            "png": file, "cell": [r.cell_width, r.cell_height], "columns": r.grid_columns,
            "firstChar": r.first_char, "widths": r.char_widths, "advances": r.char_widths_frac,
        }));
    }
    json!({ "name": pfr.font_name, "pixelFont": parsed.is_pixel_font, "sizes": sizes })
}

/// Faces meeting at less than this angle share a smoothed normal (see `smooth_normals`).
const SMOOTH_ANGLE_DEG: f32 = 135.0;

/// Per-vertex normals that blend across shared corners, like the files' authored
/// smoothing.
///
/// dirplayer's decoder can't read the normals stored in CLOD meshes (it recovers the
/// polar angle but not the azimuth), so it rebuilds them from the faces using each
/// vertex. These models store a separate copy of every corner per face, so those
/// rebuilt normals are flat per face, and the robots looked faceted where Adobe's
/// player shades them smoothly. Here every vertex takes the area-weighted normals of
/// all faces touching its position whose normal is within `max_angle` of its own
/// face's.
fn smooth_normals(positions: &[[f32; 3]], faces: &[[u32; 3]], max_angle_deg: f32) -> Vec<[f32; 3]> {
    use std::collections::HashMap;
    let sub = |a: [f32; 3], b: [f32; 3]| [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let cross = |u: [f32; 3], v: [f32; 3]| [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let norm = |v: [f32; 3]| {
        let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        if l > 1e-12 { [v[0] / l, v[1] / l, v[2] / l] } else { [0.0, 0.0, 0.0] }
    };
    let dot = |a: [f32; 3], b: [f32; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let key = |p: [f32; 3]| [(p[0] * 1000.0).round() as i64, (p[1] * 1000.0).round() as i64, (p[2] * 1000.0).round() as i64];
    // Area-weighted (unnormalised) and unit face normals.
    let mut weighted = vec![];
    let mut unit = vec![];
    let mut at: HashMap<[i64; 3], Vec<usize>> = HashMap::new();
    let mut own: Vec<Vec<usize>> = vec![vec![]; positions.len()];
    for (fi, f) in faces.iter().enumerate() {
        let (Some(&a), Some(&b), Some(&c)) = (positions.get(f[0] as usize), positions.get(f[1] as usize), positions.get(f[2] as usize)) else {
            weighted.push([0.0; 3]);
            unit.push([0.0; 3]);
            continue;
        };
        let n = cross(sub(b, a), sub(c, a));
        weighted.push(n);
        unit.push(norm(n));
        for &v in f {
            at.entry(key(positions[v as usize])).or_default().push(fi);
            own[v as usize].push(fi);
        }
    }
    let cos_max = max_angle_deg.to_radians().cos();
    (0..positions.len())
        .map(|v| {
            // The vertex's own direction: its faces' normals averaged.
            let mut mine = [0.0f32; 3];
            for &fi in &own[v] {
                for k in 0..3 { mine[k] += weighted[fi][k] }
            }
            let mine = norm(mine);
            let mut sum = [0.0f32; 3];
            for &fi in at.get(&key(positions[v])).map(|l| l.as_slice()).unwrap_or(&[]) {
                if dot(unit[fi], mine) >= cos_max {
                    for k in 0..3 { sum[k] += weighted[fi][k] }
                }
            }
            let n = norm(sum);
            if n == [0.0, 0.0, 0.0] { mine } else { n }
        })
        .collect()
}

/// A sound member's audio, found the way dirplayer finds it: a `snd ` chunk, a media
/// chunk (Shockwave Audio), or a sndH header with sndS samples.
fn sound_of(def: &vm_rust::director::chunks::cast_member::CastMemberDef) -> Option<vm_rust::director::chunks::sound::SoundChunk> {
    use vm_rust::director::chunks::sound::SoundChunk;
    for c in def.children.iter().flatten() {
        match c {
            Chunk::Sound(s) => return Some(s.clone()),
            Chunk::Media(m) if !m.audio_data.is_empty() => {
                let mut sc = SoundChunk::new(m.audio_data.clone());
                sc.set_metadata(m.sample_rate, 1, if m.is_compressed { 0 } else { 16 });
                return Some(sc);
            }
            _ => {}
        }
    }
    let header = def.children.iter().flatten().find_map(|c| match c { Chunk::SndHeader(h) => Some(h), _ => None })?;
    let samples = def.children.iter().flatten().find_map(|c| match c { Chunk::SndSamples(d) => Some(d), _ => None })?;
    Some(SoundChunk::from_snd_header_and_samples(header, samples))
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
                    "normals": bin.f32s(smooth_normals(&m.positions, &m.faces, SMOOTH_ANGLE_DEG).iter().flatten().copied()),
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
                "crease": info.map(|r| r.normal_crease),
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

/// The world of a new, empty Shockwave 3D member, as Adobe's player makes it
/// (new(#shockwave3d), checked with its Lingo): the camera DefaultView 250 units out
/// on +Z (fieldOfView 34.516, hither 1), a black ambient light UIAmbient and a white
/// directional light UIDirectional shining down from the front-top (directionalPreset
/// #topCenter).
fn export_empty_world(dir: &Path, base: &str) {
    let node = |name: &str, typ: &str, transform: [f32; 16], fov: f32, far: f32| {
        json!({
            "name": name, "parent": "world", "type": typ, "resource": name, "modelResource": "", "shader": "",
            "visibility": 1, "transform": transform.to_vec(), "near": 1.0, "far": far, "fov": fov, "ortho": false,
        })
    };
    let light = |name: &str, typ: &str, color: [f32; 3]| {
        json!({ "name": name, "type": typ, "color": color.to_vec(), "attenuation": [1.0, 0.0, 0.0], "spotAngle": 90.0, "enabled": true, "specular": true, "spotDecay": false })
    };
    let s = std::f32::consts::FRAC_1_SQRT_2;
    let doc = json!({
        "bin": format!("{}.bin", base),
        "nodes": [
            node("DefaultView", "view", [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 250.0, 1.0], 34.516, f32::MAX),
            node("UIAmbient", "light", [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0], 30.0, 1000.0),
            node("UIDirectional", "light", [1.0, 0.0, 0.0, 0.0, 0.0, s, -s, 0.0, 0.0, s, s, 0.0, 0.0, 176.77669, 176.77669, 1.0], 30.0, 1000.0),
        ],
        "shaders": [], "materials": [],
        "lights": [light("UIAmbient", "ambient", [0.0, 0.0, 0.0]), light("UIDirectional", "directional", [1.0, 1.0, 1.0])],
        "textures": {}, "resources": {}, "textureInfo": [], "skeletons": [], "motions": 0,
    });
    fs::write(dir.join(format!("{}.json", base)), serde_json::to_string(&doc).unwrap()).unwrap();
    fs::write(dir.join(format!("{}.bin", base)), []).unwrap();
}
