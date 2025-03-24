from flask import Flask, render_template, request, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import html
import pandas as pd
import unicodedata
from datetime import datetime
from datetime import timedelta
from markupsafe import Markup
from flask import make_response
from io import BytesIO
from flask_mail import Mail, Message
from flask import jsonify 
from datetime import datetime, timedelta, time

app = Flask(__name__)
app.secret_key = 'secret_key_flask'


@app.template_filter('format_datetime')
def format_datetime(value, format='%d/%m/%Y %H:%M:%S'):
    """Formate une date selon le format spécifié."""
    if value is None:
        return ""
    try:
        # Conversion en datetime si la valeur est une chaîne
        if isinstance(value, str):
            value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value.strftime(format)
    except Exception as e:
        return value  # Retourne la valeur brute en cas d'erreur



# Configuration du service SMTP
app.config['MAIL_SERVER'] = 'smtp-mail.outlook.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = 'gprezelin@adgv-tolerie.com'  # Adresse email complète
app.config['MAIL_PASSWORD'] = 'U9q5yPs=7YQzMrP4'  # Mot de passe ou mot de passe d'application
app.config['MAIL_DEFAULT_SENDER'] = 'gprezelin@adgv-tolerie.com'


mail = Mail(app)

# Configuration du auto
@app.route('/get_next_available_date', methods=['POST'])
def get_next_available_date():
    """
    Retourne le prochain créneau disponible respectant les règles définies,
    en tenant compte des urgences.
    """
    try:
        # Charger les données envoyées par le client
        data = request.get_json()
        is_urgent = data.get('urgent', False)  # Par défaut, ce n'est pas urgent

        # Définition des heures de travail
        work_start = time(8, 0)
        work_end = time(17, 0)
        lunch_start = time(12, 0)
        lunch_end = time(13, 0)

        # Date de début pour la recherche
        search_date = datetime.now()

        # Connexion à la base de données
        conn = get_db_connection()
        cursor = conn.cursor()

        # Fonction utilitaire pour vérifier le chevauchement
        def is_overlapping(start1, end1, start2, end2):
            return start1 < end2 and start2 < end1

        # Récupérer les créneaux admin
        cursor.execute('''
            SELECT slot_time, end_time FROM tickets
            WHERE created_by_admin = 1
        ''')
        admin_blocks = [
            {
                "start": datetime.strptime(row['slot_time'], '%Y-%m-%d %H:%M:%S'),
                "end": datetime.strptime(row['end_time'], '%Y-%m-%d %H:%M:%S')
            }
            for row in cursor.fetchall()
        ]

        # Récupérer les créneaux clients
        cursor.execute('''
            SELECT slot_time, end_time FROM tickets
            WHERE created_by_admin = 0
        ''')
        client_slots = [
            {
                "start": datetime.strptime(row['slot_time'], '%Y-%m-%d %H:%M:%S'),
                "end": datetime.strptime(row['end_time'], '%Y-%m-%d %H:%M:%S')
            }
            for row in cursor.fetchall()
        ]

        # Recherche du prochain créneau disponible
        while True:
            for hour in range(work_start.hour, work_end.hour):
                if search_date.date() == datetime.now().date() and hour <= datetime.now().hour:
                    continue  # Ignore les créneaux dans le passé de la journée en cours

                if lunch_start.hour <= hour < lunch_end.hour:
                    continue

                slot_time = datetime.combine(search_date.date(), time(hour, 0))
                end_time = slot_time + timedelta(hours=1)

                # Vérifier les conflits avec les créneaux admin
                admin_conflict = False
                for admin_block in admin_blocks:
                    if is_overlapping(slot_time, end_time, admin_block["start"], admin_block["end"]):
                        # Cas où le créneau est sur un ticket admin
                        if not is_urgent:
                            # Si ce n'est pas urgent, refuser le créneau
                            admin_conflict = True
                            break

                        # Si c'est urgent, vérifier le nombre de tickets urgents pour ce jour
                        urgent_tickets = [
                            slot for slot in client_slots
                            if slot["start"].date() == slot_time.date()
                        ]
                        if len(urgent_tickets) >= 2:
                            # Refuser si déjà 2 tickets urgents pour ce jour
                            admin_conflict = True
                            break

                if admin_conflict:
                    continue

                # Vérifier les conflits avec les créneaux clients
                client_conflict = any(
                    is_overlapping(slot_time, end_time, client_slot["start"], client_slot["end"])
                    for client_slot in client_slots
                )

                if client_conflict:
                    continue

                # Si aucun conflit, retourner le créneau disponible
                return jsonify({'next_available_date': slot_time.strftime('%Y-%m-%dT%H:%M')})

            # Passer au jour suivant si aucun créneau n'est disponible pour la journée actuelle
            search_date += timedelta(days=1)

    except Exception as e:
        print(f"Erreur lors de la recherche du prochain créneau : {e}")
        return jsonify({'error': f"Erreur : {e}"}), 500

# ------------------------
# Fonction pour obtenir une connexion à la base de données
# ------------------------
def get_db_connection():
    conn = sqlite3.connect('tickets.db', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn



# ------------------------
# Initialisation de la base de données
# ------------------------
def init_db():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                description TEXT NOT NULL,
                slot_time DATETIME NOT NULL,
                status TEXT DEFAULT 'EN COURS',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

# ------------------------
# Vérification des créneaux disponibles avec une durée de 1h
# ------------------------
def is_slot_available(slot_time):
    try:
        # Convertir l'heure du créneau demandé en objet datetime
        slot_time_obj = datetime.strptime(slot_time, "%Y-%m-%d %H:%M:%S")

        # Calculer la plage de vérification (1 heure avant et après)
        one_hour_before = slot_time_obj - timedelta(hours=1)
        one_hour_after = slot_time_obj + timedelta(hours=1)

        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Rechercher les tickets qui chevauchent la plage d'une heure
            cursor.execute('''
                SELECT * FROM tickets
                WHERE slot_time BETWEEN ? AND ?
            ''', (one_hour_before.strftime("%Y-%m-%d %H:%M:%S"), one_hour_after.strftime("%Y-%m-%d %H:%M:%S")))

            # Si un ticket existe dans cette plage, le créneau n'est pas disponible
            result = cursor.fetchone()
            return result is None  # True si aucun ticket trouvé, donc créneau libre
    except Exception as e:
        print(f"Erreur lors de la vérification du créneau : {e}")
        return False


# ------------------------
# Route principale (index)
# ------------------------
@app.route('/index', methods=['GET', 'POST'])
def index():
    if 'username' in session:
        username = session['username']
        email = session['email']

        # Initialisation des variables pour conserver les champs
        title = ""
        description = ""

        with get_db_connection() as conn:
            cursor = conn.cursor()

            if request.method == 'POST':
                try:
                    title = html.escape(request.form['title'])
                    description = html.escape(request.form['description'])
                    slot_time_input = request.form['slot_time']  # Date et heure de début
                    is_urgent = 'urgent' in request.form  # Vérifie si la case "Urgent" est cochée

                    # Conversion de la date/heure de début
                    slot_time = datetime.strptime(slot_time_input, "%Y-%m-%dT%H:%M")

                    # Vérifiez si le créneau est dans les heures autorisées (hors 12h-13h)
                    if not (8 <= slot_time.hour < 12 or 13 <= slot_time.hour < 17):
                        flash("Vous ne pouvez réserver un créneau qu'entre 8h-12h et 13h-17h.", "error")
                        raise ValueError("Créneau en dehors des heures autorisées")

                    # Calcul automatique de l'heure de fin (+1 heure)
                    end_time = slot_time + timedelta(hours=1)

                    # Vérifiez si la plage horaire est déjà bloquée par un autre client
                    cursor.execute('''
                        SELECT * FROM tickets
                        WHERE created_by_admin = 0
                        AND (slot_time < ? AND end_time > ?)
                    ''', (end_time.strftime('%Y-%m-%d %H:%M:%S'), slot_time.strftime('%Y-%m-%d %H:%M:%S')))
                    overlapping_ticket_client = cursor.fetchone()

                    if overlapping_ticket_client:
                        flash("Une autre personne a déjà réservé cette plage horaire. Veuillez choisir une autre heure.", "error")
                        raise ValueError("Créneau déjà réservé par un autre client")

                    # Vérifiez si la plage horaire est occupée par un ticket admin
                    cursor.execute('''
                        SELECT * FROM tickets
                        WHERE created_by_admin = 1
                        AND (slot_time < ? AND end_time > ?)
                    ''', (end_time.strftime('%Y-%m-%d %H:%M:%S'), slot_time.strftime('%Y-%m-%d %H:%M:%S')))
                    overlapping_ticket_admin = cursor.fetchone()

                    if overlapping_ticket_admin:
                        admin_slot_time = datetime.strptime(overlapping_ticket_admin['slot_time'], "%Y-%m-%d %H:%M:%S")
                        admin_end_time = datetime.strptime(overlapping_ticket_admin['end_time'], "%Y-%m-%d %H:%M:%S")

                        if not is_urgent:
                            # Pour les tickets classiques : Refuser tout chevauchement avec un ticket admin
                            flash("Cette plage horaire est réservée par un administrateur. Veuillez choisir un autre jour.", "error")
                            raise ValueError("Créneau déjà réservé par un administrateur")

                        # Pour les tickets urgents : Limiter à 2 tickets par jour sur les jours intermédiaires
                        admin_duration = (admin_end_time - admin_slot_time).days
                        if admin_slot_time.date() < slot_time.date() <= admin_end_time.date():
                            cursor.execute('''
                                SELECT COUNT(*) FROM tickets
                                WHERE created_by_admin = 0
                                AND DATE(slot_time) = ?
                            ''', (slot_time.date(),))
                            client_tickets_on_day = cursor.fetchone()[0]

                            if client_tickets_on_day >= 2:
                                flash("Les créneaux urgents sont déjà complets pour cette journée.", "error")
                                raise ValueError("Limite de tickets urgents atteinte pour cette journée")

                    # Insérez le ticket avec la durée par défaut de 1 heure
                    cursor.execute('''
                        INSERT INTO tickets (title, name, email, description, slot_time, end_time, status, created_by_admin)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        title,
                        username,
                        email,
                        description,
                        slot_time.strftime('%Y-%m-%d %H:%M:%S'),
                        end_time.strftime('%Y-%m-%d %H:%M:%S'),
                        "Ouvert",
                        0  # created_by_admin = 0 pour les utilisateurs
                    ))
                    conn.commit()

                    # Envoi d'un email à l'administrateur
                    try:
                        message = Message(
                            subject=f"Nouvelle demande de ticket : {title}",
                            recipients=["gprezelin@adgv-tolerie.com"], 
                            body=f"Bonjour,\n\nUn nouveau ticket a été créé par {username}.\n\n"
                                 f"Titre : {title}\nDescription : {description}\n"
                                 f"Date et heure de début : {slot_time.strftime('%Y-%m-%d %H:%M:%S')}\n\nCordialement,\nLe système de gestion des tickets."
                        )
                        mail.send(message)
                    except Exception as e:
                        flash(f"Erreur lors de l'envoi de l'email à l'administrateur : {e}", "error")

                    flash("Ticket créé avec succès. L'administrateur a été informé par email et traitera votre demande prochainement.", "success")
                    return redirect(url_for('index'))
                except Exception as e:
                    print(f"Erreur : {e}")  # Debugging info

            # Récupération des tickets avec admin_comment
            cursor.execute('''
                SELECT id, title, name, email, description, slot_time, end_time, status, admin_comment 
                FROM tickets
            ''')
            rows = cursor.fetchall()

            # Couleurs dynamiques pour chaque statut
            status_colors = {
                "OUVERT": "#3788d8",  # Bleu
                "Demande traitée": "#22c4dd",  # cyan
                "En cours de livraison": "#ff9800",  # Orange pâle
                "Clôturé": "#33a728"  # Vert
            }

            # Tickets formatés pour FullCalendar
            formatted_tickets = [
                {
                    "id": ticket["id"],
                    "title": html.escape(ticket['title']),
                    "start": ticket["slot_time"],  # Début
                    "end": ticket["end_time"],  # Fin
                    "extendedProps": {
                        "description": html.escape(ticket["description"]),
                        "first_name": html.escape(ticket["name"]),
                        "email": html.escape(ticket["email"]),
                        "start_time": ticket["slot_time"],  # Heure de début
                        "end_time": ticket["end_time"],  # Heure de fin
                    },
                    "backgroundColor": status_colors.get(ticket["status"], "#3788d8"),  # Couleur par défaut : OUVERT
                    "borderColor": status_colors.get(ticket["status"], "#3788d8")
                }
                for ticket in rows
            ]

        # Ajout de `title` et `description` au template pour les réutiliser
        return render_template('index.html', tickets=formatted_tickets, raw_tickets=rows, username=username, email=email, title=title, description=description)

    return redirect(url_for('login'))

# ------------------------
# Routes d'inscription et connexion
# ------------------------

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        try:
            username = html.escape(request.form['username'])
            email = html.escape(request.form['email'])
            password = generate_password_hash(request.form['password'])
            role = html.escape(request.form['role'])

            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
                               (username, email, password, role))
                conn.commit()
                flash("Inscription réussie. Connectez-vous maintenant.", "success")
                return redirect(url_for('login'))  # Redirige vers la page de connexion après l'inscription
        except sqlite3.IntegrityError:
            flash("Erreur : Le nom d'utilisateur ou l'email existe déjà.", "error")
            return redirect(url_for('register'))  # Redirige vers la page d'inscription après une erreur

    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = html.escape(request.form['username'])
        password = request.form['password']

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
            user = cursor.fetchone()

        if user and check_password_hash(user['password'], password):
            session['username'] = user['username']
            session['email'] = user['email']
            session['role'] = user['role']

            # Vérification du rôle et redirection vers la page appropriée
            if user['role'] == 'administrateur':  # Rôle exact
                return redirect(url_for('admin'))  # Redirige vers la page admin pour l'admin
            else:
                return redirect(url_for('index'))  # Redirige vers la page index pour les utilisateurs classiques

        flash("Erreur : Nom d'utilisateur ou mot de passe incorrect.", "error")
        return redirect(url_for('login'))  # Redirige vers la page de login après une erreur

    return render_template('login.html')


# ------------------------
# Route de déconnexion
# ------------------------
@app.route('/logout')
def logout():
    session.clear()
    flash("Déconnexion réussie.", "success")
    return redirect(url_for('login'))


# ------------------------
# Interface Admin
# ------------------------
@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if 'role' in session and session['role'] == 'administrateur':  # Vérifie que l'utilisateur est un administrateur
        with get_db_connection() as conn:
            cursor = conn.cursor()

            if request.method == 'POST':
                try:
                    title = html.escape(request.form['title'])
                    description = html.escape(request.form['description'])
                    date_range = request.form['date_range']  # Champ contenant la plage de dates
                    name = request.form['name']
                    email = request.form['email']

                    # Debug pour vérifier la valeur brute du champ date_range
                    app.logger.debug(f"DEBUG: Date Range reçu: {date_range}")

                    # Sépare la plage en début et fin
                    if ' to ' in date_range:
                        start_datetime, end_datetime = map(str.strip, date_range.split(' to '))
                    else:
                        raise ValueError("Format de plage de dates invalide : pas de séparateur 'to' trouvé.")

                    # Conversion des dates au format attendu
                    start_dt_obj = datetime.strptime(start_datetime, "%d/%m/%Y %H:%M")
                    end_dt_obj = datetime.strptime(end_datetime, "%d/%m/%Y %H:%M")

                    # Vérification de validité des dates
                    if start_dt_obj >= end_dt_obj:
                        flash("La date de début doit être antérieure à la date de fin.", "error")
                        return redirect(url_for('admin'))

                    # Vérification de chevauchement avec d'autres tickets administratifs
                    cursor.execute('''
                        SELECT * FROM tickets
                        WHERE created_by_admin = 1
                        AND (slot_time < ? AND end_time > ?)
                    ''', (
                        end_dt_obj.strftime('%Y-%m-%d %H:%M:%S'),
                        start_dt_obj.strftime('%Y-%m-%d %H:%M:%S')
                    ))
                    overlapping_admin_ticket = cursor.fetchone()

                    if overlapping_admin_ticket:
                        flash("Un autre ticket administratif existe déjà sur cette plage horaire. Veuillez choisir un autre créneau.", "error")
                        return redirect(url_for('admin'))

                    # Insérez un ticket unique couvrant toute la plage horaire
                    cursor.execute('''
                        INSERT INTO tickets (title, name, email, description, slot_time, end_time, status, created_by_admin)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        title,
                        name,
                        email,
                        description,
                        start_dt_obj.strftime('%Y-%m-%d %H:%M:%S'),
                        end_dt_obj.strftime('%Y-%m-%d %H:%M:%S'),
                        "Ouvert",
                        1  # created_by_admin = 1 pour identifier que ce ticket a été créé par un administrateur
                    ))
                    conn.commit()

                    flash("Le ticket couvrant la plage horaire a été créé avec succès.", "success")
                    return redirect(url_for('admin'))

                except ValueError as ve:
                    app.logger.error(f"Erreur de conversion de date : {ve}")
                    flash("Format de plage de dates invalide. Veuillez sélectionner une plage valide.", "error")
                except Exception as e:
                    app.logger.error(f"Erreur lors de la création du ticket : {e}")
                    flash(f"Erreur lors de la création du ticket : {e}", "error")

            # Récupération des tickets et conversion en dictionnaire
            cursor.execute("SELECT * FROM tickets")
            tickets = [dict(ticket) for ticket in cursor.fetchall()]  # Convertir chaque Row en dictionnaire

            # Définir les couleurs des statuts pour FullCalendar
            status_colors = {
                "OUVERT": "#3788d8",  # Bleu
                "Demande traitée": "#22c4dd",  # cyan
                "En cours de livraison": "#ff9800",  # Orange pâle
                "Clôturé": "#33a728"  # Vert
            }

            # Appliquer les couleurs en fonction du statut
            for ticket in tickets:
                ticket['start'] = ticket['slot_time']  # Champ 'start' pour FullCalendar
                ticket['end'] = ticket['end_time']  # Champ 'end' pour FullCalendar
                ticket['backgroundColor'] = status_colors.get(ticket['status'], "#3788d8")  # Couleur de fond
                ticket['borderColor'] = status_colors.get(ticket['status'], "#3788d8")  # Couleur de bordure
                ticket['title'] = ticket['title']  # Champ 'title' pour FullCalendar
                ticket['extendedProps'] = {
                    'first_name': ticket['name'],  # Le nom de l'utilisateur
                    'email': ticket['email'],  # L'email de l'utilisateur
                    'description': ticket['description']  # La description du ticket
                }

        return render_template('admin.html', tickets=tickets)

    return redirect(url_for('login'))  # Si ce n'est pas un administrateur, redirige vers la page de login


# ------------------------
# Route pour éditer un ticket
# ------------------------
@app.route('/edit_ticket/<int:ticket_id>', methods=['GET', 'POST'])
def edit_ticket(ticket_id):
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Récupérer les informations du ticket à partir de l'ID
        cursor.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
        ticket = cursor.fetchone()

        if not ticket:
            flash("Ticket introuvable.", "error")
            return redirect(url_for('admin'))

        if request.method == 'POST':
            try:
                title = html.escape(request.form['title'])
                description = html.escape(request.form['description'])
                slot_time_input = request.form['slot_time']
                end_time_input = request.form['end_time']
                status = request.form['status']
                admin_comment = html.escape(request.form['admin_comment'])

                # Conversion des dates
                slot_time = datetime.strptime(slot_time_input, "%Y-%m-%dT%H:%M")
                end_time = datetime.strptime(end_time_input, "%Y-%m-%dT%H:%M")

                # Validation : vérifier que la date de début est avant la date de fin
                if slot_time >= end_time:
                    flash("La date et heure de début doivent être antérieures à la date et heure de fin.", "error")
                    return redirect(url_for('edit_ticket', ticket_id=ticket_id))

                # Mettre à jour le ticket dans la base de données
                cursor.execute(''' 
                    UPDATE tickets 
                    SET title = ?, description = ?, slot_time = ?, end_time = ?, status = ?, admin_comment = ? 
                    WHERE id = ? 
                ''', (
                    title,
                    description,
                    slot_time.strftime('%Y-%m-%d %H:%M:%S'),
                    end_time.strftime('%Y-%m-%d %H:%M:%S'),
                    status,
                    admin_comment,
                    ticket_id
                ))
                conn.commit()

                # Envoi d'un email au client pour l'informer des modifications
                try:
                    client_email = ticket['email']  # Email du client depuis le ticket existant
                    message_body = (
                        f"Bonjour {ticket['name']},\n\n"
                        f"Votre ticket a été mis à jour par l'administrateur.\n\n"
                        f"Détails de la mise à jour :\n"
                        f"Titre : {title}\n"
                        f"Description : {description}\n"
                        f"Date et heure de début : {slot_time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                        f"Date et heure de fin : {end_time.strftime('%Y-%m-%d %H:%M:%S')}\n"
                        f"Statut : {status}\n"
                        f"Commentaire de l'administrateur : {admin_comment}\n\n"
                        f"Cordialement,\n"
                        f"L'équipe de gestion des tickets."
                    )
                    message = Message(
                        subject=f"Mise à jour de votre ticket : {title}",
                        recipients=[client_email],
                        body=message_body
                    )
                    mail.send(message)
                except Exception as e:
                    flash(f"Erreur lors de l'envoi de l'email au client : {e}", "error")

                flash("Ticket mis à jour avec succès.", "success")
                return redirect(url_for('admin'))  # Retourner à la page admin après la mise à jour
            except Exception as e:
                flash(f"Erreur lors de la mise à jour du ticket : {e}", "error")

        # Si la méthode est GET, pré-remplir le formulaire avec les données actuelles du ticket
        return render_template('edit_ticket.html', ticket=ticket)


# ------------------------
# ------------------------
# Route pour supprimer un ticket
# ------------------------
@app.route('/delete_ticket/<int:ticket_id>', methods=['POST'])
def delete_ticket(ticket_id):
    if 'role' in session and session['role'] == 'administrateur':  # Vérifie que l'utilisateur est administrateur
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM tickets WHERE id = ?', (ticket_id,))
                conn.commit()
            flash("Ticket supprimé avec succès.", "success")
        except Exception as e:
            flash(f"Erreur lors de la suppression du ticket : {e}", "error")
        return '', 200  # Retourne un statut HTTP 200 OK sans afficher de page
    return redirect(url_for('login'))  # Si ce n'est pas un administrateur, redirige vers la page de login


# ------------------------
# auto update
# ------------------------

@app.route('/get_tickets', methods=['GET'])
def get_tickets():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, title, name, email, description, slot_time, end_time, status, admin_comment 
            FROM tickets
        ''')
        rows = cursor.fetchall()

    # Définir des couleurs selon le statut
    status_colors = {
        "Clôturé": "#33a728",
        "Demande traitée": "#22c4dd",
        "En cours de livraison": "#ff9800",
        "Inconnu": "#3788d8",
        "Statut corrompu": "#3788d8"  # Par défaut en cas d'erreur
    }

    tickets = []
    for row in rows:
        try:
            if row["status"]:
                status_clean = row["status"].encode('latin1').decode('utf-8', 'ignore')
                status_mappings = {
                    "Cltur": "Clôturé",
                    "Demande traite": "Demande traitée",
                    "En cours de livr": "En cours de livraison"
                }
                for key, value in status_mappings.items():
                    if key in status_clean:
                        status_clean = value
                        break
            else:
                status_clean = "Inconnu"
        except UnicodeDecodeError:
            status_clean = "Statut corrompu"

        # Convertir les dates depuis la base en objets datetime (si non null)
        dt_slot = datetime.strptime(row["slot_time"], "%Y-%m-%d %H:%M:%S") if row["slot_time"] else None
        dt_end = datetime.strptime(row["end_time"], "%Y-%m-%d %H:%M:%S") if row["end_time"] else None

        tickets.append({
            "id": row["id"],
            "title": row["title"],
            # Format ISO pour le calendrier
            "start": dt_slot.isoformat() if dt_slot else None,
            "end": dt_end.isoformat() if dt_end else None,
            # Format lisible pour le tableau
            "startFormatted": dt_slot.strftime("%d/%m/%Y %H:%M") if dt_slot else "Non défini",
            "endFormatted": dt_end.strftime("%d/%m/%Y %H:%M") if dt_end else "Non défini",
            "status": status_clean,
            # Ajout des couleurs pour FullCalendar
            "backgroundColor": status_colors.get(status_clean, "#3788d8"),
            "borderColor": status_colors.get(status_clean, "#3788d8"),
            "extendedProps": {
                "first_name": row["name"],  # Utiliser first_name pour l'affichage dans le calendrier
                "email": row["email"],
                "description": row["description"]
            },
            "admin_comment": row["admin_comment"] or "Aucun"
        })

    return jsonify(tickets)


# ------------------------
# Export fichier excel
# ------------------------


@app.route('/export_tickets', methods=['GET'])
def export_tickets():
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Récupérer tous les tickets
        cursor.execute('''SELECT id, title, name, email, description, slot_time, end_time, status, admin_comment FROM tickets''')
        tickets = cursor.fetchall()

        # Créer un DataFrame pour organiser les données
        df = pd.DataFrame(tickets, columns=['ID', 'Titre', 'Nom', 'Email', 'Description', 'Début', 'Fin', 'Statut', 'Commentaire'])

        # Utiliser BytesIO pour écrire le fichier Excel en mémoire
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)

        # Récupérer les données Excel en mémoire
        output.seek(0)

        # Créer la réponse Flask pour télécharger le fichier
        response = make_response(output.read())
        response.headers["Content-Disposition"] = "attachment; filename=tickets.xlsx"
        response.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        return response

# ------------------------
# Point d'entrée
# ------------------------
if __name__ == '__main__':
    init_db()
    app.run(debug=True, threaded=True)
