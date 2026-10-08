"""The page template: one professor's data in, one HTML page out.

The look follows the design made for Prof. Parag Patel: warm paper, burgundy accent, Spectral serif,
double rules above each section, and a career drawn as a step chart.
"""
import html
import json
import re
from datetime import date

from places import find_places

MAKER_NAME, MAKER_URL = "Harshit Singh", "https://harshit-singh-two.vercel.app"
NOW = date.today().year + (date.today().month - 1) / 12
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# Roles ordered by responsibility. This sets the chart's vertical order; it is not a score.
LADDER = [
    (11, r"vice[- ]chancellor|president\b"), (10, r"provost|pro[- ]vice"), (8, r"senior associate dean"),
    (7, r"(associate|assistant|vice|deputy) dean"), (9, r"\bdean\b"), (6, r"\bdirector\b"),
    (5, r"\bhead\b|chair(person|man)? of|department chair"), (3, r"associate professor"),
    (2, r"assistant professor|senior lecturer|reader"), (4, r"\bprofessor\b"),
    (1, r"lecturer|post-?doc|fellow|research(er| scientist| associate)|scientist|instructor|faculty"),
]
SIDE = re.compile(r"member|board|committee|consultant|advis|association|panel|council|editor|reviewer|"
                  r"co-chair|vice chairman|trustee|jury|mentor|volunteer", re.I)


def esc(s):
    return html.escape(str(s or ""), quote=True)


def clean(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def tokens(s):
    return re.findall(r"[a-z0-9]{4,}", (s or "").lower())


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def when(s):
    """'July 2025' -> 2025.5, 'Present' -> now, '' -> None."""
    s = clean(s).lower()
    if re.search(r"present|current|now|till date|to date|ongoing", s):
        return NOW
    y = re.search(r"(19|20)\d{2}", s)
    if not y:
        return None
    m = next((i for name, i in MONTHS.items() if name in s), 0)
    return int(y.group(0)) + m / 12


def rank(title):
    t = title.lower()
    return next((r for r, pat in LADDER if re.search(pat, t)), 0)


def short(title):
    s = clean(re.split(r"[,@(–—]| - ", title)[0])
    return s if len(s) <= 34 else s[:32].rsplit(" ", 1)[0] + "…"


def span(p):
    a, b = clean(p.get("start")), clean(p.get("end"))
    if a and b:
        return f"{a} – {b[0].lower() + b[1:] if b.lower().startswith('present') else b}"
    return a or b


def split_positions(positions):
    """Main academic track versus boards, committees and other side roles."""
    track, side = [], []
    for p in positions:
        t = clean(p.get("title"))
        if not t:
            continue
        (track if rank(t) and not SIDE.search(t) else side).append(p)
    return track, side


def career_chart(track, everything):
    """Turn dated roles into the step chart: one step each time the most senior role held changes."""
    dated = []
    for p in track:
        a, b = when(p.get("start")), when(p.get("end")) or NOW
        if b < NOW:
            b += 1 / 12  # "to June 2022" runs to the end of June, so it meets a role starting in July
        if a is not None and b > a:
            dated.append((a, b, rank(p["title"]), p))
    if len(dated) < 3:
        return None
    cuts = sorted({x for a, b, _, _ in dated for x in (a, b)})
    segs = []
    for lo, hi in zip(cuts, cuts[1:]):
        live = [d for d in dated if d[0] <= lo and d[1] >= hi]
        if not live:
            continue
        top = max(live, key=lambda d: (d[2], d[0]))
        if segs and segs[-1]["p"] is top[3]:
            segs[-1]["to"] = hi
        else:
            segs.append({"p": top[3], "rank": top[2], "from": lo, "to": hi})
    # A gap of a few weeks between two roles is a handover, not a step down: fold it into the next role.
    kept = []
    for i, s in enumerate(segs):
        if s["to"] - s["from"] < 0.3 and i < len(segs) - 1:
            segs[i + 1]["from"] = s["from"]
        elif kept and kept[-1]["p"] is s["p"]:
            kept[-1]["to"] = s["to"]
        else:
            kept.append(s)
    segs = kept
    if len(segs) < 3:
        return None
    levels = sorted({s["rank"] for s in segs})
    stops = []
    for s in segs:
        p = s["p"]
        also = []
        for q in everything:
            a, b = when(q.get("start")), when(q.get("end")) or NOW
            if q is p or a is None or a >= s["to"] or b <= s["from"]:
                continue
            also.append({"t": clean(f"{q.get('title', '')}, {q.get('org', '')}").strip(", "), "d": span(q)})
        stops.append({"year": int(s["from"]), "from": round(s["from"], 2), "to": round(s["to"], 2),
                      "level": levels.index(s["rank"]), "label": short(p["title"]), "dates": span(p),
                      "title": clean(p["title"]), "org": clean(p.get("org")), "text": clean(p.get("note")),
                      "also": also[:3]})
    labels = [next(s["label"] for s in stops if s["level"] == i) for i in range(len(levels))]
    return {"start": int(min(c for c in cuts)), "end": int(NOW) + 1, "now": round(NOW, 2), "levels": labels, "stops": stops}


# ---------- pieces ----------

def section(anchor, label, heading, body):
    if not body:
        return ""
    return (f'<section class="sec wrap" id="{anchor}" aria-labelledby="h-{anchor}"><div class="rule"></div>'
            f'<div class="sec__grid"><div class="sec__head"><p class="label">{esc(label)}</p>'
            f'<h2 id="h-{anchor}">{esc(heading)}</h2></div><div class="sec__body">{body}</div></div></section>')


def trow(main, sub="", mid="", right=""):
    out = f'<div class="trow"><div class="trow__main">{main}' + (f'<span class="trow__sub">{esc(sub)}</span>' if sub else "") + "</div>"
    if mid:
        out += f'<div class="trow__mid">{esc(mid)}</div>'
    return out + f'<div class="trow__when">{esc(right)}</div></div>'


def slots(title, names):
    boxes = "".join(f'<div class="slot"><span>{esc(n)}</span></div>' for n in names)
    return f'<p class="slots__title">{esc(title)}</p><div class="slots">{boxes}</div>'


def render(p):
    p = {**p, "interests": [x[:1].upper() + x[1:] for x in p["interests"]]}  # tidy display; the data file is untouched
    name, uni, dept = p["name"], p["university"], p["department"]
    last = name.split()[-1] if name.split() else name
    c, l = p["contact"], p["links"]
    parts = name.split()
    initials = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper() if parts else ""
    phd = any(re.search(r"ph\.?\s?d|d\.?phil|doctor of philosophy", e.get("degree", ""), re.I) for e in p["education"])
    track, side = split_positions(p["positions"])
    chart = career_chart(track, p["positions"])
    pubs, awards, edu = p["publications"], p["awards"], p["education"]

    # ----- opening -----
    portrait = (f'<img src="{esc(p["photo"])}" alt="Portrait of {esc(name)}">' if p["photo"]
                else f'<span class="portrait__initials" aria-hidden="true">{esc(initials)}</span>')
    caption = clean(p.get("location")) or uni
    glance = []  # (label, main text as HTML, note)
    if p["role"]:
        glance.append(("Position", esc(p["role"]), uni))
    if p["interests"]:
        glance.append(("Research", esc(", ".join(p["interests"][:2])), "Research interests"))
    if edu:
        doctorate = re.compile(r"ph\.?\s?d|d\.?phil|doctor", re.I)
        top = next((e for e in edu if doctorate.search(e.get("degree", ""))), edu[0])  # lead with the doctorate
        glance.append(("Education", esc(top.get("degree", "")), " ".join(x for x in (top.get("org"), top.get("year")) if x)))
    m = p.get("metrics") or {}
    count = lambda n: f'<span data-count="{int(n)}">{int(n):,}</span>'  # counts up when it scrolls into view
    if m.get("citations") and int(m["citations"]) >= 100:
        glance.append(("Google Scholar", f"{count(m['citations'])} citations", f"h-index {m.get('h_index', '')}".strip()))
    elif awards:
        glance.append(("Recognition", esc(awards[0].get("title", "").strip('"')), " ".join(x for x in (awards[0].get("by"), awards[0].get("year")) if x)))
    elif len(pubs) >= 3:
        glance.append(("Publications", f"{count(len(pubs))} listed", "Journal articles and papers"))
    glance_html = "".join(f'<div class="glance__item" style="--i:{i}"><span class="label">{esc(a)}</span><span class="glance__main">{b}</span>'
                          f'<span class="glance__note">{esc(n)}</span></div>' for i, (a, b, n) in enumerate(glance[:4]))
    # Each word of the name sits in its own mask so it can rise into place on load.
    name_html = " ".join(f'<span class="w" style="--i:{i}"><span>{esc(w)}</span></span>' for i, w in enumerate(name.split()))
    name_class = "name--long" if max((len(w) for w in name.split()), default=0) > 9 or len(name.split()) > 3 else ""
    # A slow strip of where the work has appeared: journals if there are enough, otherwise research interests.
    venues = []
    for x in pubs:
        v = clean(re.split(r"\d|\(", clean(x.get("venue")))[0]).strip(" ,.;:")
        if 3 < len(v) < 60 and v.lower() not in (s.lower() for s in venues):
            venues.append(v[:1].upper() + v[1:])
    strip_label, strip_items = ("Published in", venues[:14]) if len(venues) >= 4 else ("Works on", p["interests"][:12])
    ticker = ""
    if len(strip_items) >= 4:
        run = "".join(f"<span>{esc(v)}</span>" for v in strip_items)
        ticker = (f'<div class="wrap"><div class="ticker"><span class="label label--muted">{strip_label}</span><div class="ticker__window">'
                  f'<div class="ticker__run">{run}</div><div class="ticker__run" aria-hidden="true">{run}</div></div></div></div>')
    hero = f"""<section class="hero wrap" id="top">
  <div class="hero__row">
    <div class="hero__text">
      <p class="label label--lg">{esc(uni or "Faculty")}</p>
      <h1 class="{name_class}" aria-label="{esc(name)}">{name_html}[[PHD]]</h1>
      <div class="hero__roles">[[ROLE]][[DEPT]]</div>
    </div>
    [[VISUAL]]
  </div>
  [[GLANCE]]
</section>""".replace("[[GLANCE]]", f'<div class="glance">{glance_html}</div>' if glance_html else "") + ticker
    # The opening visual: a 3D globe of the career's cities with the portrait set against it.
    # Without a known home city it falls back to the portrait alone, with a dot in orbit.
    world = find_places(p)
    if world:
        names = " · ".join([world["home"]["name"]] + [o["name"] for o in world["others"]])
        world_json = json.dumps({**world, "label": uni}, ensure_ascii=False).replace("</", "<\\/")
        visual = (f'<div class="hero__visual"><canvas class="globe" role="img" aria-label="Globe marking {esc(names)}"></canvas>'
                  f'<figure class="portrait portrait--onglobe"><div class="portrait__stage"><div class="portrait__mat">{portrait}</div></div></figure>'
                  f'<p class="globe__legend"><span class="label label--muted">Places in this career</span>{esc(names)}</p>'
                  f'<script type="application/json" id="globe-data">{world_json}</script></div>')
    else:
        visual = ('<figure class="portrait"><div class="portrait__stage"><span class="orb orb--back" aria-hidden="true"><b><i></i></b></span>'
                  f'<div class="portrait__mat">{portrait}</div><span class="orb orb--front" aria-hidden="true"><b><i></i></b></span></div>'
                  f'<figcaption>{esc(caption)}</figcaption></figure>')
    hero = hero.replace("[[VISUAL]]", visual)

    # ----- profile -----
    profile = ""
    if p["bio"]:
        profile = f'<p class="lede">{esc(p["bio"][0])}</p>'
        if len(p["bio"]) > 1:
            one = " cols--one" if len(p["bio"]) == 2 else ""  # a single paragraph reads better at full width
            profile += f'<div class="cols{one}">' + "".join(f"<p>{esc(x)}</p>" for x in p["bio"][1:]) + "</div>"
    if p["interests"]:
        profile += ('<div class="interests"><span class="label label--muted">Research interests</span>'
                    + "".join(f"<em>{esc(t)}</em>" for t in p["interests"]) + "</div>")

    # ----- career -----
    career = ""
    if chart:
        s0 = chart["stops"][0]
        chart_json = json.dumps(chart, ensure_ascii=False).replace("</", "<\\/")
        career = f"""<section class="career" id="career" aria-labelledby="h-career"><div class="career__scroll"><div class="career__pin wrap">
<div class="rule"></div>
<div class="career__head"><div><p class="label">Career</p>
<h2 id="h-career">From {esc(chart["stops"][0]["label"].lower())} to {esc(chart["stops"][-1]["label"].lower())}, {chart["start"]} to the present</h2></div>
<p class="career__hint">Scroll to draw the line role by role, or select a year below.</p></div>
<div class="career__layout">
  <div class="career__chart"><div data-chart></div><div class="stops" role="group" aria-label="Select a role"></div>
  <p class="career__note">Vertical axis: roles held, ordered by responsibility. It is not a score.</p></div>
  <div class="career__card" aria-live="polite"><div class="career__meta"><span data-c="dates">{esc(s0["dates"])}</span><span data-c="n">1 of {len(chart["stops"])}</span></div>
  <h3 data-c="title">{esc(s0["title"])}</h3><p class="career__org" data-c="org">{esc(s0["org"])}</p><p class="career__text" data-c="text">{esc(s0["text"])}</p>
  <div class="career__also" data-c="also"></div></div>
</div></div></div>
<script type="application/json" id="career-data">{chart_json}</script></section>"""
    cap = lambda s: s[:1].upper() + s[1:]
    appointments = "".join(trow(esc(cap(clean(x.get("title")))), " · ".join(v for v in (clean(x.get("org")), clean(x.get("note"))) if v), "", span(x))
                           for x in (track if chart or side else p["positions"]))
    roles = "".join(trow(esc(clean(x.get("org")) or clean(x.get("title"))), clean(x.get("note")),
                         clean(x.get("title")) if x.get("org") else "", span(x)) for x in side)

    # ----- research and teaching -----
    research = ""
    years = [int(y) for y in (str(x.get("year", ""))[:4] for x in pubs) if y.isdigit()]
    if len(years) >= 5:  # one bar a year, real counts from the list below
        lo, hi = min(years), max(years)
        counts = {y: years.count(y) for y in range(lo, hi + 1)}
        top = max(counts.values())
        bars = "".join(f'<li style="--h:{counts[y] / top:.3f};--k:{k}"><span>{counts[y] or ""}</span><b></b><i>{y if y in (lo, hi) else str(y)[2:]}</i></li>'
                       for k, y in enumerate(counts))
        research += (f'<figure class="years"><figcaption class="label label--muted">Publications by year, {lo} to {hi}</figcaption>'
                     f'<ol>{bars}</ol></figure>')
    for x in pubs:
        title = esc(x.get("title"))
        if x.get("url"):
            title = f'<a href="{esc(x["url"])}" target="_blank" rel="noopener">{title}</a>'
        meta = " · ".join(v for v in (clean(x.get("authors")), clean(x.get("venue"))) if v)
        research += trow(title, meta, "", clean(x.get("year")))
    profiles = [f'<a href="{esc(l[k])}" target="_blank" rel="noopener">{t}</a>' for k, t in
                (("scholar", "Google Scholar"), ("orcid", "ORCID")) if l.get(k)]
    if profiles and research:
        research += '<p class="sec__links">' + " ".join(profiles) + "</p>"
    teaching = "".join(f"<p>{esc(t)}</p>" for t in p["teaching"])

    education = "".join(trow(esc(clean(x.get("degree"))), clean(x.get("org")), "", re.sub(r"^(\S+)\s*(?:-|–|to)\s*\1$", r"\1", clean(x.get("year")))) for x in edu)
    honours = "".join(trow(esc(clean(x.get("title")).strip('"')), clean(x.get("by")), "", clean(x.get("year"))) for x in awards)
    extra = "".join(section(slug(s["title"]), s["title"], s["title"], "".join(f"<p>{esc(x)}</p>" for x in s["paragraphs"]))
                    for s in p["sections"])

    # ----- contact -----
    contact = ""
    if c["email"]:
        contact += f'<a class="contact__email" href="mailto:{esc(c["email"])}">{esc(c["email"])}</a>'
    contact += "".join(f'<p class="contact__line">{esc(x)}</p>' for x in (c["phone"], c["office"], ", ".join(v for v in (dept, uni) if v)) if x)
    more = [f'<a href="{esc(l[k])}" target="_blank" rel="noopener">{t}</a>' for k, t in
            (("profile", "University profile"), ("scholar", "Google Scholar"), ("orcid", "ORCID"), ("linkedin", "LinkedIn"), ("website", "Website")) if l.get(k)]
    if more:
        contact += '<p class="sec__links">' + " ".join(more) + "</p>"

    # ----- what the professor's input would add -----
    need = []
    if not p["photo"]:
        need.append("Portrait")
    need += ["Photographs from talks and events", "Courses taught"]
    if not pubs:
        need.append("Publications")
    need += ["Talks, media and news"]
    demo = (f'<p class="lede lede--sm">This page was built only from information that is already public. '
            f'With your input it would also carry the items below, and anything here can be reworded or removed.</p>'
            + slots(f"To be supplied by Prof. {last}", need))

    nav = "".join(f'<a href="#{a}">{t}</a>' for a, t, show in (
        ("profile", "Profile", profile), ("career", "Career", chart or appointments), ("roles", "Boards", roles),
        ("research", "Research", research), ("education", "Education", education), ("contact", "Contact", contact)) if show)
    desc = clean(p["tagline"] or (p["bio"][0] if p["bio"] else f"{p['role']}, {uni}"))[:200]
    official = f" Not an official {esc(uni)} page." if uni else ""
    phd_html = '<span class="hero__phd">PhD</span>' if phd else ""
    role_html = f'<p class="hero__role">{esc(p["role"])}</p>' if p["role"] else ""
    dept_html = f'<p class="hero__dept">{esc(dept)}</p>' if dept and dept.lower() not in p["role"].lower() else ""
    hero = hero.replace("[[PHD]]", phd_html).replace("[[ROLE]]", role_html).replace("[[DEPT]]", dept_html)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{esc(name)} · {esc(p["role"] or uni)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=Spectral:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" rel="stylesheet">
<link href="/assets/site.css" rel="stylesheet">
<script>if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('js');</script>
</head>
<body>
<div class="progress" aria-hidden="true"></div>
<header class="top wrap"><a class="top__name" href="#top">{esc(name)}<span>{esc(uni)}</span></a><nav aria-label="Sections">{nav}</nav></header>
<main>
{hero}
{section("profile", "Profile", dept or "Profile", profile)}
{career}
{section("appointments", "Appointments", "Appointments in full" if chart else "Career", appointments)}
{section("roles", "Boards and service", "Boards, committees and other roles", roles)}
{section("research", "Research", "Research and publications", research)}
{section("teaching", "Teaching", "In the classroom", teaching)}
{section("education", "Education", "Degrees and programmes", education)}
{section("recognition", "Recognition", "Honours", honours)}
{extra}
{section("contact", "Contact", "Get in touch", contact)}
{section("demo", "About this demo", "What your input would add", demo)}
</main>
<footer class="foot wrap"><div class="rule"></div><p>Concept demo prepared by <a href="{MAKER_URL}" target="_blank" rel="noopener">{MAKER_NAME}</a> for {esc(name)}.{official}</p></footer>
<script src="/assets/land.js"></script>
<script src="/assets/site.js"></script>
</body>
</html>
"""
