import sqlite3

# Connexion à la base de données
connection = sqlite3.connect('tickets.db')
cursor = connection.cursor()

# Création de la table des utilisateurs
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
)
''')

# Création de la table des tickets
cursor.execute('''
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstname TEXT NOT NULL,
    lastname TEXT NOT NULL,
    email TEXT NOT NULL,
    comment TEXT,
    status TEXT DEFAULT 'ouvert',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_date DATETIME
)
''')

connection.commit()
connection.close()

print("Base de données initialisée avec succès.")
