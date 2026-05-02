#!/usr/bin/env python3
"""Generate a PDF listing all card keywords with icons and descriptions."""

from fpdf import FPDF

FONT_MAIN = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_SYMBOL = "/tmp/DejaVuSans.ttf"


class KeywordsPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.add_font("Main", "", FONT_MAIN)
        self.add_font("Main", "B", FONT_MAIN)
        self.add_font("Sym", "", FONT_SYMBOL)

    def header(self):
        self.set_font("Main", "B", 20)
        self.set_text_color(180, 140, 60)
        self.cell(0, 14, "Armies & Magic", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Main", "", 12)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "Liste des Capacités", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)
        self.set_draw_color(180, 140, 60)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Main", "", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def tier_header(self, title):
        if self.get_y() > 250:
            self.add_page()
        self.ln(2)
        self.set_font("Main", "B", 12)
        self.set_fill_color(45, 45, 75)
        self.set_text_color(220, 190, 90)
        self.cell(0, 9, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def keyword_row(self, icon, name, description):
        x_start = self.get_x()
        y_start = self.get_y()

        # Calculate description height
        self.set_font("Main", "", 9)
        desc_width = 130
        desc_lines = self.multi_cell(desc_width, 4.5, description, dry_run=True, output="LINES")
        desc_height = len(desc_lines) * 4.5
        row_height = max(desc_height + 2, 8)

        if y_start + row_height > 272:
            self.add_page()
            y_start = self.get_y()

        # Icon (using DejaVu for symbol support)
        self.set_xy(x_start, y_start)
        self.set_font("Sym", "", 11)
        self.set_text_color(120, 90, 40)
        self.cell(12, row_height, icon, align="C")

        # Name
        self.set_xy(x_start + 12, y_start)
        self.set_font("Main", "B", 10)
        self.set_text_color(40, 40, 40)
        self.cell(48, row_height, name, align="L")

        # Description
        self.set_xy(x_start + 60, y_start)
        self.set_font("Main", "", 9)
        self.set_text_color(80, 80, 80)
        self.multi_cell(desc_width, 4.5, description)

        # Separator
        self.set_draw_color(230, 230, 230)
        self.line(x_start, self.get_y() + 1, x_start + 190, self.get_y() + 1)
        self.ln(3)


# Using Unicode symbols that DejaVu Sans supports well
keywords = {
    "Tier 0 — Commune et au-dessus": [
        ("⚔", "Raid", "Peut attaquer une créature ennemie dès son invocation (mais pas le héros)."),
        ("⚡", "Traque", "Peut attaquer dès son invocation."),
        ("◎", "Provocation", "Les ennemis doivent attaquer cette unité en priorité."),
        ("▣", "Résistance X", "Réduit les dégâts reçus de X (minimum 1 dégât)."),
        ("◈", "Bouclier", "Absorbe une première attaque sans dégâts."),
        ("∞", "Loyauté", "Invocation : +1 ATK et +1 PV pour chaque allié de même race en jeu."),
        ("⚓", "Ancré", "Ne peut pas être déplacé ou exilé."),
        ("†", "Première Frappe", "Inflige ses dégâts en premier ; l'adversaire ne riposte que s'il survit."),
        ("☄", "Berserk", "Double son ATK si ses PV actuels sont inférieurs à ses PV originaux."),
    ],
    "Tier 1 — Peu Commune et au-dessus": [
        ("≋", "Vol", "Ignore les provocations adverses qui n'ont pas Vol."),
        ("⊕", "Précision", "Ignore la Résistance, l'Armure et le Bouclier."),
        ("♥", "Drain de vie", "Soigne votre héros des dégâts infligés."),
        ("≈", "Esquive", "Évite automatiquement la première attaque reçue chaque tour."),
        ("☠", "Poison", "Les unités blessées perdent 1 PV par tour."),
        ("⇉", "Célérité", "Peut attaquer deux fois par tour."),
        ("☽", "Augure", "Quand cette unité inflige des dégâts au héros adverse, vous piochez une carte."),
        ("✚", "Bénédiction", "Soigne complètement l'unité ciblée."),
        ("♛", "Bravoure", "Double ses dégâts contre les unités ayant une ATK supérieure."),
        ("¤", "Pillage", "Invocation : l'adversaire défausse une carte de son choix."),
        ("↩", "Riposte X", "Quand cette unité subit des dégâts, inflige X dégâts à la source."),
        ("↻", "Rappel", "Invocation : remettez une carte de votre cimetière dans votre main."),
        ("☀", "Combustion", "Invocation : défaussez une carte, puis piochez deux cartes."),
    ],
    "Tier 2 — Rare et au-dessus": [
        ("◉", "Terreur", "Les unités adverses perdent 1 ATK en présence de cette carte."),
        ("▣", "Armure", "Réduit de moitié les dégâts de combat reçus (les sorts ne sont pas réduits)."),
        ("♚", "Commandement", "Les alliés de même faction gagnent +1/+1."),
        ("⚒", "Fureur", "Après avoir subi des dégâts, attaque immédiatement une unité adverse."),
        ("⚔⚔", "Double Attaque", "Inflige deux fois son ATK, dont la première en Première Frappe."),
        ("◌", "Invisible", "Ne peut pas être ciblé par des sorts ni capacités adverses."),
        ("✦", "Canalisation", "Tant que cette unité est en jeu, vos sorts coûtent 1 mana de moins."),
        ("⚗", "Catalyse", "Invocation : réduit de 1 le coût des unités de même race dans votre main."),
        ("⊘", "Contresort", "Invocation : annule le prochain sort adverse."),
        ("⊞", "Convocation X", "Invocation : crée un token X/X de la race indiquée."),
        ("◐", "Lycanthropie X", "Début de tour : se transforme en un token X/X avec Traque."),
        ("⊞⊞", "Conv. multiples", "Invocation : crée plusieurs tokens selon la configuration."),
        ("☥", "Malédiction", "Invocation : ciblez une unité ennemie, elle est exilée à la fin du prochain tour."),
        ("⊛", "Nécrophagie", "Gagne +1/+1 chaque fois qu'une unité meurt."),
        ("⊗", "Paralysie", "Les unités blessées par cette créature ne peuvent plus agir au prochain tour."),
        ("⇆", "Permutation", "Invocation : échange les PV de deux unités (une alliée, une ennemie)."),
        ("⊜", "Persécution X", "Chaque attaque inflige X dégâts au héros adverse."),
        ("◑", "Ombre du passé", "Invocation : +1/+1 par unité de même race dans votre cimetière."),
        ("⚰", "Profanation X", "Invocation : exile X cartes du cimetière pour +X/+X."),
        ("⊡", "Prescience X", "Invocation : piochez jusqu'à avoir X cartes en main."),
        ("⊛", "Suprématie", "Invocation : +1/+1 par carte en main."),
        ("◎", "Divination", "Invocation : révèle 3 cartes de la pioche, placez-en une sur le dessus."),
        ("⊞", "Sélection X", "Invocation : révèle X cartes de votre collection, ajoutez-en une à votre main."),
        ("✦", "Traque du destin X", "Invocation : révèle X cartes du deck, prenez-en une en main."),
        ("⌂", "Fierté du clan", "Les unités de même clan invoquées arrivent avec +1/+1."),
        ("⊕", "Solidarité X", "Invocation : piochez X cartes si vous contrôlez 2 autres unités de même clan."),
        ("∿", "Sang mêlé", "+1/+1 pour chaque type de race différent parmi vos alliés en jeu."),
    ],
    "Tier 3 — Épique et au-dessus": [
        ("⊶", "Liaison de vie", "Partage les dégâts subis avec le héros adverse."),
        ("●", "Ombre", "Ne peut être ciblée ni attaquée tant qu'elle n'a pas agi."),
        ("♠", "Sacrifice", "Invocation : détruisez un allié pour gagner ses PV et ATK."),
        ("☬", "Maléfice", "À la mort, inflige X dégâts à toutes les unités (X = ATK)."),
        ("♾", "Indestructible", "Ne subit aucun dégât de combat."),
        ("♥", "Régénération", "Récupère 2 PV au début de chaque tour."),
        ("☢", "Carnage X", "Mort : inflige X dégâts à toutes les unités en jeu."),
        ("☧", "Héritage X", "Mort : chaque allié en jeu gagne +X/+X permanent."),
        ("◈", "Mimique", "Invocation : copie toutes les capacités d'une unité ciblée."),
        ("◇", "Métamorphose", "Invocation : devient une copie exacte d'une unité ciblée."),
        ("☰", "Tactique X", "Invocation : attribue X capacité(s) choisie(s) à un allié."),
        ("⚱", "Exhumation X", "Invocation : ressuscite une unité du cimetière de coût ≤ X."),
        ("⚱", "Héritage cimetière", "Invocation : copie les capacités d'une unité de votre cimetière."),
        ("✝", "Martyr", "Mort : toutes vos unités de même race gagnent +1/+1 permanent."),
        ("◐", "Instinct meute X", "+X/+X si une unité de même clan est morte ce tour."),
        ("♻", "Cycle éternel", "Mort : ajoute une copie dans le deck, mise en jeu directe si piochée."),
        ("⊞", "Rassemblement X", "Invocation : révèle X cartes du deck, ajoutez les unités de même race."),
        ("↻", "Relancer X", "Invocation : rejoue les X derniers sorts avec cibles aléatoires."),
    ],
    "Tier 4 — Légendaire uniquement": [
        ("♥", "Pacte de sang", "Mort : invoque deux tokens 1/1 de sa race."),
        ("☀", "Souffle de feu X", "Inflige X dégâts à toutes les unités ennemies lors de l'attaque."),
        ("◉", "Domination", "Prend le contrôle d'une unité ennemie au hasard à l'invocation."),
        ("✦", "Résurrection", "Revient en jeu après sa mort avec 1 PV (une seule fois)."),
        ("★", "Transcendance", "Immunité totale aux sorts adverses."),
        ("♦", "Vampirisme X", "Invocation : vole X PV à une unité ennemie ciblée."),
        ("♣", "Corruption", "Convertit une unité ennemie à votre camp jusqu'à fin de tour avec Traque."),
        ("◆", "Totem", "Gagne les capacités de toutes les unités de même race alliées."),
        ("⊕", "Appel du clan X", "Invocation : met en jeu la première unité de même clan de coût ≤ X depuis le deck."),
    ],
}


pdf = KeywordsPDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

for tier, kws in keywords.items():
    pdf.tier_header(tier)
    for icon, name, desc in kws:
        pdf.keyword_row(icon, name, desc)

output_path = "/Users/encellefabrice/Documents/armies-and-magic/Armies-and-Magic-Capacites.pdf"
pdf.output(output_path)
print(f"PDF generated: {output_path}")
