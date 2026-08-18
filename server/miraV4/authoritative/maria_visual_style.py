"""
Maria Cavali Visual Style — deterministic creative-direction layer for Mira V4.

This module does not train an image model. It acts as a reusable expert skill:
it translates Creative DNA into Maria Cavali's visual grammar before the final
Moodboard image prompt is sent to the image-generation provider.

Customer-facing output: one coherent editorial Moodboard containing five connected
visual moments from the same creative production.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
import hashlib
import json
from typing import Any, Iterable, Mapping, Sequence

STYLE_VERSION = "maria-visual-style-v1.0"
PROMPT_VERSION = "mira-moodboard-maria-style-v1.0"


class HumanExperience(str, Enum):
    QUIET_AUTHORITY = "Quiet Authority"
    FREEDOM = "Freedom"
    ENCHANTMENT = "Enchantment"
    CONNECTION = "Connection"
    TRANSFORMATION = "Transformation"
    CALLING = "Calling"
    MYSTERY = "Mystery"
    PLAYFULNESS = "Playfulness"
    RESILIENCE = "Resilience"
    BEING = "Being"
    LEAP_OF_FAITH = "Leap of Faith"
    CREATIVE_FLOW = "Creative Flow"


@dataclass(frozen=True)
class MariaVisualPrinciples:
    principles: tuple[str, ...] = (
        "Beauty without meaning is decoration.",
        "Begin with the human truth, never with an aesthetic trend.",
        "Every visual decision must express one clear idea.",
        "Use one dominant metaphor rather than many decorative symbols.",
        "Suggest enough for the viewer to complete the story; do not explain everything.",
        "Story comes before a fully visible face.",
        "The subject should inhabit a moment, not merely pose for a portrait.",
        "Every image should feel like a frame from a film with a before and an after.",
        "Ordinary life may become editorial through precise seeing, styling and composition.",
        "Confidence is calm, spacious and self-possessed, never aggressive or performative.",
        "Fashion supports identity and story; it must never become empty display.",
        "Use physical phenomena as storytelling devices: light, shadow, wind, water, glass, reflection, projection and motion.",
        "Preserve believable reality and introduce at most one impossible or surreal element when enchantment is needed.",
        "Maintain emotional precision, editorial restraint and visual curiosity.",
        "A five-image Moodboard is one campaign story, not five unrelated beautiful images.",
    )


@dataclass(frozen=True)
class MariaVisualSignature:
    signature_statement: str = "Unexpected symbolism with emotional precision."
    product_statement: str = (
        "Translate the person's invisible inner world into one coherent editorial campaign."
    )
    avoid_identity: tuple[str, ...] = (
        "generic luxury",
        "boss-babe clichés",
        "stock photography",
        "therapy-app aesthetics",
        "random Pinterest collage",
        "obvious symbolism",
        "over-explained concepts",
        "trend-led styling without meaning",
        "visual clutter",
        "forced confidence",
        "perfect but emotionally empty imagery",
    )


@dataclass(frozen=True)
class VisualGrammar:
    narrative: tuple[str, ...] = (
        "cinematic moment",
        "visual sentence",
        "one meaningful action",
        "partial revelation",
        "viewer completes the story",
        "emotional continuity across scenes",
    )
    composition: tuple[str, ...] = (
        "intentional negative space",
        "unexpected but controlled crop",
        "asymmetrical yet stable framing",
        "symmetry only when it communicates certainty, alignment or self-possession",
        "environmental framing through architecture, windows, cars, glass or foreground objects",
        "close detail balanced with wider contextual frames",
        "story-first sequencing",
    )
    subject_treatment: tuple[str, ...] = (
        "relaxed self-possession",
        "expressive eyes when the face is visible",
        "strong body language without forced power posing",
        "natural elegance",
        "presence over performance",
        "the subject engaged in a meaningful moment",
        "faces may be obscured, reflected, cropped or secondary when the story benefits",
    )
    light: tuple[str, ...] = (
        "light used as narrative, not merely illumination",
        "window light",
        "hard geometric shadow",
        "soft directional light",
        "projection",
        "silhouette",
        "reflected light",
        "late-afternoon or cinematic ambient light",
    )
    physical_phenomena: tuple[str, ...] = (
        "wind",
        "water",
        "shadow",
        "reflection",
        "glass and refraction",
        "projection",
        "smoke or mist",
        "motion blur",
        "silhouette",
        "negative space",
    )
    styling: tuple[str, ...] = (
        "editorial but human",
        "fashion used as meaning",
        "tailoring contrasted with softness",
        "styled simplicity",
        "bare feet or one unpolished detail when it adds humanity",
        "unexpected prop with narrative purpose",
        "ordinary setting elevated into a set",
    )
    texture: tuple[str, ...] = (
        "linen", "silk", "paper", "glass", "water", "stone", "wood",
        "concrete", "leather", "smoke", "weathered metal", "natural skin",
    )
    colour_rules: tuple[str, ...] = (
        "colour must carry emotional meaning",
        "prefer a disciplined palette with one intentional accent",
        "red may signal courage, life force, feminine power or danger",
        "deep blue may signal mystery, intelligence, distance or calm",
        "black may signal depth, restraint and self-possession",
        "warm neutrals may signal intimacy, groundedness and quiet elegance",
        "avoid random brightness or trend palettes disconnected from the story",
    )


@dataclass(frozen=True)
class ExperienceProfile:
    definition: str
    visual_meaning: tuple[str, ...]
    preferred_devices: tuple[str, ...]
    avoid: tuple[str, ...] = ()


EXPERIENCE_LIBRARY: dict[HumanExperience, ExperienceProfile] = {
    HumanExperience.QUIET_AUTHORITY: ExperienceProfile(
        "Calm power that does not need to prove itself.",
        ("self-possession", "clarity", "competence", "emotional steadiness"),
        ("restrained tailoring", "architectural framing", "clean negative space", "stable posture", "minimal symbolic prop"),
        ("corporate headshot", "arms-crossed stock pose", "status luxury"),
    ),
    HumanExperience.FREEDOM: ExperienceProfile(
        "Expansion beyond restriction; the body and world open outward.",
        ("release", "possibility", "movement", "permission", "openness"),
        ("wind through hair or fabric", "open arms", "wide sky, road, sea or rooftop", "unexpected angles", "fences or walls dissolving"),
        ("tourism cliché", "generic beach happiness", "escape without meaning"),
    ),
    HumanExperience.ENCHANTMENT: ExperienceProfile(
        "Believable reality touched by one impossible, magical element.",
        ("awe", "wonder", "possibility", "the world feels alive"),
        ("giant moon", "portal", "glowing light", "floating", "enchanted nature", "cosmic scale"),
        ("fantasy costume", "dragons", "unicorn cliché", "multiple competing surreal effects"),
    ),
    HumanExperience.CONNECTION: ExperienceProfile(
        "Alignment without losing individuality.",
        ("belonging", "recognition", "shared rhythm", "emotional safety"),
        ("touch", "pattern alignment", "mirrored gesture", "shared movement", "proximity without posing"),
        ("posed group portrait", "forced romance", "performative togetherness"),
    ),
    HumanExperience.TRANSFORMATION: ExperienceProfile(
        "The version already inside begins to become visible.",
        ("becoming", "integration", "awakening", "inner expansion"),
        ("threshold", "light emerging from within", "reflection", "layers", "reconstruction", "nature through cracks", "motion blur"),
        ("makeover before-and-after", "literal butterfly overload", "broken-person narrative"),
    ),
    HumanExperience.CALLING: ExperienceProfile(
        "A quiet inner knowing that life has a direction worth following.",
        ("soul mission", "guidance", "intuition", "service", "divine timing"),
        ("path", "threshold", "light in heart or hands", "receiving signal", "hourglass", "one person moving against the crowd"),
        ("achievement trophy", "hustle imagery", "literal destiny text"),
    ),
    HumanExperience.MYSTERY: ExperienceProfile(
        "An invitation to discover what remains hidden.",
        ("curiosity", "selective visibility", "unknown depth", "secret knowledge"),
        ("door", "key", "mask", "partial face", "shadow", "glass", "book or archive"),
        ("horror", "threat", "opaque darkness with no invitation"),
    ),
    HumanExperience.PLAYFULNESS: ExperienceProfile(
        "Permission to be delightfully imperfect and creatively alive.",
        ("joy", "curiosity", "spontaneity", "rule-breaking", "humour"),
        ("genuine laughter", "unexpected gesture", "fashion with wit", "unusual use of an ordinary object", "movement"),
        ("childish styling", "forced comedy", "loud novelty for attention"),
    ),
    HumanExperience.RESILIENCE: ExperienceProfile(
        "Life may bend the person, but growth quietly continues.",
        ("continuation", "adaptation", "healing", "soft strength"),
        ("flower through concrete", "tree through stone", "golden repair", "carrying weight gracefully", "walking toward light"),
        ("battle imagery", "victory pose", "aggression", "trauma spectacle"),
    ),
    HumanExperience.BEING: ExperienceProfile(
        "Nothing needs to change for this moment to be complete.",
        ("presence", "self-return", "timelessness", "union with nature"),
        ("still observation", "water", "open sky", "hand on heart", "suspended time", "simple natural gesture"),
        ("wellness stock image", "guided meditation cliché", "empty passivity"),
    ),
    HumanExperience.LEAP_OF_FAITH: ExperienceProfile(
        "Moving before certainty exists because the inner yes is stronger.",
        ("courage", "trust", "risk", "threshold", "heart before proof"),
        ("crossing a gap", "approaching the unknown", "edge used carefully", "open door", "step into light"),
        ("recklessness", "sports victory", "battle bravery"),
    ),
    HumanExperience.CREATIVE_FLOW: ExperienceProfile(
        "Inspiration moves through the person and becomes something new.",
        ("receiving", "embodied creation", "imagination", "world-making"),
        ("beam of light", "hands holding energy", "halo or moon", "painting the world", "water and feminine movement", "idea becoming tangible"),
        ("generic artist-at-desk", "productivity imagery", "random sparkles without meaning"),
    ),
}


@dataclass(frozen=True)
class FiveSceneStory:
    roles: tuple[str, ...] = (
        "Opening world — establish the emotional and visual universe.",
        "Presence — reveal the subject's energy, styling and body language.",
        "Meaning — express the central human truth through one metaphor or visual sentence.",
        "Environment or detail — deepen the story through architecture, material, object, texture or intimate observation.",
        "Closing movement — leave transformation, invitation or an unresolved cinematic after-feeling.",
    )


@dataclass
class CampaignInput:
    title_hint: str = ""
    creative_dna: Mapping[str, Any] = field(default_factory=dict)
    practical_need: str = ""
    inspiration_explanation: str = ""
    human_experiences: Sequence[str] = field(default_factory=tuple)
    must_include: Sequence[str] = field(default_factory=tuple)
    avoid: Sequence[str] = field(default_factory=tuple)


@dataclass(frozen=True)
class CompiledMariaDirection:
    style_version: str
    prompt_version: str
    signature: str
    campaign_title_hint: str
    selected_experiences: tuple[str, ...]
    experience_direction: tuple[dict[str, Any], ...]
    principles: tuple[str, ...]
    narrative_rules: tuple[str, ...]
    composition_rules: tuple[str, ...]
    light_rules: tuple[str, ...]
    styling_rules: tuple[str, ...]
    physical_phenomena: tuple[str, ...]
    texture_rules: tuple[str, ...]
    colour_rules: tuple[str, ...]
    scene_roles: tuple[str, ...]
    required_continuity: tuple[str, ...]
    must_include: tuple[str, ...]
    avoid: tuple[str, ...]
    source_fingerprint: str


def _clean_strings(values: Iterable[Any]) -> tuple[str, ...]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value).strip()
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            cleaned.append(text)
    return tuple(cleaned)


def _normalize_experiences(values: Sequence[str]) -> tuple[HumanExperience, ...]:
    allowed = {item.value.casefold(): item for item in HumanExperience}
    result: list[HumanExperience] = []
    for raw in values:
        key = str(raw).strip().casefold()
        if key in allowed and allowed[key] not in result:
            result.append(allowed[key])
    return tuple(result[:5])


def _fingerprint(payload: Mapping[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compile_maria_direction(campaign: CampaignInput) -> CompiledMariaDirection:
    """Compile Maria's authorship layer deterministically. Makes no AI call."""
    principles = MariaVisualPrinciples()
    signature = MariaVisualSignature()
    grammar = VisualGrammar()
    scenes = FiveSceneStory()
    experiences = _normalize_experiences(campaign.human_experiences)

    experience_direction = tuple(
        {
            "name": experience.value,
            "definition": EXPERIENCE_LIBRARY[experience].definition,
            "visualMeaning": list(EXPERIENCE_LIBRARY[experience].visual_meaning),
            "preferredDevices": list(EXPERIENCE_LIBRARY[experience].preferred_devices),
            "avoid": list(EXPERIENCE_LIBRARY[experience].avoid),
        }
        for experience in experiences
    )

    rules = campaign.creative_dna.get("creativeRules", {})
    creative_dna_must = rules.get("mustInclude", []) if isinstance(rules, Mapping) else []
    creative_dna_avoid = rules.get("avoid", []) if isinstance(rules, Mapping) else []
    boundaries = campaign.creative_dna.get("creativeBoundaries", [])
    boundary_values = boundaries if isinstance(boundaries, Sequence) and not isinstance(boundaries, (str, bytes)) else [boundaries]

    must_include = _clean_strings([
        *campaign.must_include,
        *creative_dna_must,
        campaign.practical_need,
        campaign.inspiration_explanation,
    ])
    avoid = _clean_strings([
        *signature.avoid_identity,
        *campaign.avoid,
        *creative_dna_avoid,
        *boundary_values,
    ])

    fingerprint_payload = {
        "styleVersion": STYLE_VERSION,
        "promptVersion": PROMPT_VERSION,
        "creativeDna": campaign.creative_dna,
        "humanExperiences": [item.value for item in experiences],
        "mustInclude": must_include,
        "avoid": avoid,
    }

    return CompiledMariaDirection(
        style_version=STYLE_VERSION,
        prompt_version=PROMPT_VERSION,
        signature=signature.signature_statement,
        campaign_title_hint=campaign.title_hint.strip(),
        selected_experiences=tuple(item.value for item in experiences),
        experience_direction=experience_direction,
        principles=principles.principles,
        narrative_rules=grammar.narrative,
        composition_rules=grammar.composition,
        light_rules=grammar.light,
        styling_rules=grammar.styling,
        physical_phenomena=grammar.physical_phenomena,
        texture_rules=grammar.texture,
        colour_rules=grammar.colour_rules,
        scene_roles=scenes.roles,
        required_continuity=(
            "one coherent editorial campaign",
            "same production world",
            "consistent subject/casting treatment where relevant",
            "locked colour grammar",
            "locked lighting language",
            "locked styling language",
            "locked environment or architecture",
            "locked material and texture family",
            "locked emotional register",
            "no unrelated visual styles between scenes",
        ),
        must_include=must_include,
        avoid=avoid,
        source_fingerprint=_fingerprint(fingerprint_payload),
    )


def build_composite_moodboard_prompt(
    campaign: CampaignInput,
    *,
    subject_description: str = "an anonymous adult editorial subject",
    aspect_ratio_instruction: str = "vertical 2:3 editorial contact sheet",
) -> str:
    """Build one five-scene composite image prompt. Makes no provider call."""
    direction = compile_maria_direction(campaign)

    experience_lines = []
    for item in direction.experience_direction:
        experience_lines.append(
            f"- {item['name']}: {item['definition']} Preferred devices: {', '.join(item['preferredDevices'])}."
        )

    def bullets(items: Sequence[str]) -> str:
        return "\n".join(f"- {item}" for item in items)

    return f"""
Create one original {aspect_ratio_instruction} containing exactly five visually distinct but connected moments from one editorial campaign.

This is a Mira Moodboard shaped by Maria Cavali's visual authorship:
"{direction.signature}"

CUSTOMER CAMPAIGN SOURCE
Campaign title hint: {direction.campaign_title_hint or 'derive a concise poetic title from the Creative DNA'}
Creative DNA: {json.dumps(campaign.creative_dna, ensure_ascii=False, sort_keys=True)}
Practical need: {campaign.practical_need or 'not separately specified'}
Inspiration meaning: {campaign.inspiration_explanation or 'no explicit inspiration explanation supplied'}
Subject: {subject_description}

SUPPORTED HUMAN EXPERIENCES
{chr(10).join(experience_lines) if experience_lines else '- Do not force a Human Experience label. Follow the Creative DNA evidence.'}

MARIA CREATIVE PRINCIPLES
{bullets(direction.principles)}

FIVE-SCENE STORY
1. Opening world — establish the campaign's emotional and visual universe.
2. Presence — reveal energy, body language, casting treatment and styling.
3. Meaning — communicate the central human truth through one precise visual metaphor.
4. Environment or detail — deepen the story through architecture, material, object, texture or intimate observation.
5. Closing movement — leave a cinematic after-feeling, transformation or invitation.

LOCKED CONTINUITY
{bullets(direction.required_continuity)}

NARRATIVE
{bullets(direction.narrative_rules)}

COMPOSITION
{bullets(direction.composition_rules)}

LIGHT
{bullets(direction.light_rules)}

STYLING
{bullets(direction.styling_rules)}

PHYSICAL STORYTELLING DEVICES
Choose only devices supported by this person's Creative DNA:
{bullets(direction.physical_phenomena)}

TEXTURE
{bullets(direction.texture_rules)}

COLOUR
{bullets(direction.colour_rules)}

MUST INCLUDE
{bullets(direction.must_include) if direction.must_include else '- Every scene must serve the central human truth.'}

AVOID
{bullets(direction.avoid)}

FINAL ART-DIRECTION REQUIREMENTS
- The result must feel like one campaign photographed during one production.
- Do not create five unrelated Pinterest-style references.
- Every scene must have a different narrative role while preserving the same world.
- Use one dominant metaphor; supporting details may echo it but must not compete.
- Do not make the person look broken, diagnosed, coached or therapeutically interpreted.
- Preserve identity and humanity; avoid generic AI perfection.
- Use photographic realism with artistic editorial direction.
- Keep faces and hands anatomically credible.
- Do not include words, typography, captions, logos, letters, numbers or watermarks inside the image.
- Do not imitate or copy any identifiable existing photograph.
""".strip()


def to_dict(direction: CompiledMariaDirection) -> dict[str, Any]:
    return asdict(direction)


def export_style_json() -> str:
    payload = {
        "styleVersion": STYLE_VERSION,
        "promptVersion": PROMPT_VERSION,
        "principles": asdict(MariaVisualPrinciples()),
        "signature": asdict(MariaVisualSignature()),
        "visualGrammar": asdict(VisualGrammar()),
        "humanExperiences": {experience.value: asdict(profile) for experience, profile in EXPERIENCE_LIBRARY.items()},
        "fiveSceneStory": asdict(FiveSceneStory()),
    }
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)


if __name__ == "__main__":
    # Safe smoke test: no network or AI call.
    example = CampaignInput(
        title_hint="The World Answers Back",
        creative_dna={
            "identity": {"core": ["creative", "independent", "emotionally precise"]},
            "creativeDirection": {"overallLanguage": "cinematic editorial confidence with one surreal intervention"},
            "visualWorld": {
                "colour": ["deep blue", "black", "warm skin", "one red accent"],
                "light": ["hard window shadow", "late-afternoon directional light"],
                "materials": ["glass", "water", "tailoring", "weathered metal"],
                "composition": ["negative space", "unexpected crop", "story before face"],
            },
            "creativeRules": {
                "mustInclude": ["one meaningful symbolic object", "cinematic continuity"],
                "avoid": ["stock-business imagery", "obvious luxury"],
            },
            "creativeBoundaries": ["never corporate", "never visually empty"],
        },
        practical_need="A five-scene remote editorial shoot direction for a founder.",
        inspiration_explanation="An ordinary scene becomes fashion and one small visual decision carries the idea.",
        human_experiences=["Quiet Authority", "Freedom", "Mystery", "Creative Flow"],
    )
    print(build_composite_moodboard_prompt(example))
