document.addEventListener('DOMContentLoaded', function () {
    let calendar;

    function initializeCalendar(tickets) {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) {
            console.error("L'élément 'calendar' n'existe pas dans le DOM !");
            return;
        }

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'fr',
            contentHeight: 'auto',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth',
            },
            events: convertTicketDates(tickets), // Conversion initiale des tickets

            // Personnalisation de l'affichage des événements
            eventContent: function (arg) {
                const truncateText = (text, maxLength) =>
                    text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

                const title = truncateText(arg.event.title || "Sans titre", 20);
                const description = truncateText(arg.event.extendedProps?.description || "Aucune description", 30);
                const startTime = new Date(arg.event.start).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const endTime = arg.event.end
                    ? new Date(arg.event.end).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                    : null;

                const formattedStartDate = new Date(arg.event.start).toLocaleDateString('fr-FR');
                const formattedEndDate = arg.event.end
                    ? new Date(arg.event.end).toLocaleDateString('fr-FR')
                    : null;

                const eventEl = document.createElement('div');
                eventEl.classList.add('custom-event');

                // Inclure les heures de début et de fin dans l'affichage
                eventEl.innerHTML = `
                    <div class="custom-event-title">${title}</div>
                    <div class="custom-event-description">${description}</div>
                    <div class="custom-event-time">
                        Début: ${startTime} (${formattedStartDate})<br>
                        Fin: ${endTime ? `${endTime} (${formattedEndDate})` : "N/A"}
                    </div>
                    <div class="custom-event-requestor">Utilisateur: ${arg.event.extendedProps?.first_name || "Inconnu"}</div>
                `;

                eventEl.style.backgroundColor = arg.event.backgroundColor;
                eventEl.style.borderColor = arg.event.borderColor;
                eventEl.style.width = '100%';
                eventEl.style.height = '100%';

                return { domNodes: [eventEl] };
            },

            // Ouvre une modale pour les détails au clic
            eventClick: function (info) {
                const event = info.event;

                const startDate = new Date(event.start).toLocaleString('fr-FR');
                const endDate = event.end
                    ? new Date(event.end).toLocaleString('fr-FR')
                    : "Non disponible";

                const modalContent = `
                    <p><strong>Titre :</strong> ${event.title}</p>
                    <p><strong>Description :</strong> ${event.extendedProps?.description || "Aucune description"}</p>
                    <p><strong>Utilisateur :</strong> ${event.extendedProps?.first_name || "Inconnu"}</p>
                    <p><strong>Date et heure de début :</strong> ${startDate}</p>
                    <p><strong>Date et heure de fin :</strong> ${endDate}</p>
                `;

                showModal(modalContent);
            }
        });

        calendar.render();
    }

    // Fonction pour convertir les dates des tickets
    function convertTicketDates(tickets) {
        return tickets.map(ticket => {
            return {
                id: ticket.id.toString(),  // Assurez-vous que l'ID est bien une chaîne pour la comparaison
                title: ticket.title,
                start: new Date(ticket.start),
                end: ticket.end ? new Date(ticket.end) : null,
                extendedProps: ticket.extendedProps,
                backgroundColor: ticket.backgroundColor,
                borderColor: ticket.borderColor,
            };
        });
    }

    // Fonction pour mettre à jour uniquement les événements sans flash
    function updateCalendarEvents(tickets) {
        const newEvents = convertTicketDates(tickets);
        const currentEvents = calendar.getEvents();

        // Ajouter ou mettre à jour les nouveaux événements
        newEvents.forEach(newEvent => {
            const existingEvent = currentEvents.find(e => e.id === newEvent.id);

            if (existingEvent) {
                // Vérifier si une mise à jour est nécessaire
                if (
                    existingEvent.title !== newEvent.title ||
                    existingEvent.start.toISOString() !== newEvent.start.toISOString() ||
                    (existingEvent.end && existingEvent.end.toISOString() !== newEvent.end?.toISOString())
                ) {
                    existingEvent.setProp('title', newEvent.title);
                    existingEvent.setDates(newEvent.start, newEvent.end);
                    existingEvent.setExtendedProp('extendedProps', newEvent.extendedProps);
                    existingEvent.setProp('backgroundColor', newEvent.backgroundColor);
                    existingEvent.setProp('borderColor', newEvent.borderColor);
                }
            } else {
                // Ajouter un nouvel événement
                calendar.addEvent(newEvent);
            }
        });

        // Supprimer les événements qui ne sont plus présents
        currentEvents.forEach(existingEvent => {
            if (!newEvents.find(newEvent => newEvent.id === existingEvent.id)) {
                existingEvent.remove();
            }
        });
    }

    // Fonction pour récupérer les tickets et mettre à jour le calendrier
    function fetchAndUpdateCalendar() {
        fetch('/get_tickets', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            updateCalendarEvents(data);  // Mettre à jour les événements sans flash
        })
        .catch(error => console.error('Erreur lors de la récupération des tickets :', error));
    }

    // Fonction pour afficher la modale
    function showModal(content) {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <span class="modal-close">&times;</span>
                ${content}
            </div>
        `;
        modal.classList.add('modal-container');
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-overlay').addEventListener('click', () => modal.remove());
    }

    // Fonction pour mettre à jour les événements (si un statut est modifié)
    function updateEventInCalendar(ticketId, status) {
        const status_colors = {
            "Ouvert": "#3788d8",  // Bleu
            "Demande traitée": "#22c4dd",  // Gris clair
            "En cours de livraison": "#ff9800",  // Orange pâle
            "Clôturé": "#33a728"  // Vert
        };

        const event = calendar.getEventById(ticketId.toString());
        if (event) {
            event.setProp('backgroundColor', status_colors[status]);
            event.setProp('borderColor', status_colors[status]);
        }
    }

    // Initialisation du calendrier au chargement de la page
    fetch('/get_tickets', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        initializeCalendar(data);  // Créer et afficher le calendrier
    })
    .catch(error => console.error('Erreur lors de la récupération des tickets :', error));

    // Auto-update toutes les 10 secondes sans perturber l'affichage
    setInterval(fetchAndUpdateCalendar, 10000);
});






document.addEventListener("DOMContentLoaded", function () { 
    const backToTopBtn = document.getElementById("back-to-top");
    let inactivityTimer; // Timer pour détecter l'inactivité

    // Fonction pour cacher le bouton après 3 secondes d'inactivité
    function hideBackToTop() {
        backToTopBtn.style.display = "none";
    }

    // Réinitialiser le timer d'inactivité à chaque interaction ou mouvement
    function resetInactivityTimer() {
        if (window.scrollY > 300) { // Le bouton reste visible seulement si on a scrollé
            backToTopBtn.style.display = "block";
        }
        clearTimeout(inactivityTimer); // Réinitialise le timer
        inactivityTimer = setTimeout(hideBackToTop, 2000); // Cacher après 3 secondes d'inactivité
    }

    // Affiche ou cache le bouton en fonction du scroll
    window.addEventListener("scroll", function () {
        if (window.scrollY > 300) {
            backToTopBtn.style.display = "block";
        } else {
            backToTopBtn.style.display = "none";
        }
        resetInactivityTimer(); // Réinitialise le timer lors du défilement
    });

    // Ajoutez des écouteurs pour d'autres interactions (souris, clavier, etc.)
    document.addEventListener("mousemove", resetInactivityTimer);
    document.addEventListener("keydown", resetInactivityTimer);

    // Initialisez le timer d'inactivité dès le chargement de la page
    resetInactivityTimer();

    // Scroll vers le haut lorsqu'on clique sur le bouton
    backToTopBtn.addEventListener("click", function () {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
});




// bouton déco 

document.addEventListener("DOMContentLoaded", function () {
    const logoutBtn = document.getElementById("logout-btn");

    // Affiche immédiatement le bouton si la page est en haut
    if (window.scrollY === 0) {
        logoutBtn.classList.add("show");
    }

    // Affiche ou cache le bouton en fonction du scroll
    window.addEventListener("scroll", function () {
        if (window.scrollY === 0) {
            // Si on est en haut de la page, on montre le bouton
            logoutBtn.classList.add("show");
        } else {
            // Si on descend, on cache le bouton
            logoutBtn.classList.remove("show");
        }
    });

    // Bouton Déconnexion : Redirige vers la page de déconnexion
    logoutBtn.addEventListener("click", function () {
        window.location.href = "/logout"; // Assurez-vous que cette route existe
    });
});




document.addEventListener('DOMContentLoaded', function () {
    // Sélectionne l'élément contenant les messages flash
    const flashMessageContainer = document.getElementById('flash-message');

    if (flashMessageContainer) {
        // Récupère tous les messages flash
        const flashMessages = flashMessageContainer.querySelectorAll('.alert');

        flashMessages.forEach(function (message) {
            // Délai de 6 secondes avant de commencer la disparition
            setTimeout(function () {
                // Ajoute une transition de fondu pour rendre le message plus fluide
                message.style.transition = "opacity 0.5s ease";
                message.style.opacity = 0;

                // Après la transition (0.5s), on retire complètement le message
                setTimeout(function () {
                    message.remove(); // Retire le message du DOM
                }, 400); // Attente de 0.5s (durée de la transition)
            }, 5000); // Délai de 6 secondes avant de commencer à fondre
        });
    }
});




let deleteTicketId = null; // Stocke l'ID du ticket à supprimer

// Affiche le modal de confirmation de suppression (uniquement si 'deleteModal' existe)
function showDeleteModal(ticketId) {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        deleteTicketId = ticketId; // Stocke l'ID du ticket
        modal.style.display = 'block'; // Affiche le modal
    }
}

// Ferme le modal (uniquement si 'deleteModal' existe)
function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) {
        modal.style.display = 'none'; // Cache le modal
    }
}

// Ajout d'un écouteur pour confirmer la suppression (uniquement si 'confirmDelete' existe)
const confirmDeleteBtn = document.getElementById('confirmDelete');
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', function () {
        if (deleteTicketId !== null) {
            fetch(`/delete_ticket/${deleteTicketId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            .then(response => {
                if (response.ok) {
                    location.reload(); // Recharge la page après la suppression du ticket
                } else {
                    alert('Erreur lors de la suppression du ticket');
                }
            })
            .catch(error => console.error('Erreur :', error));
            closeDeleteModal(); // Ferme le modal
        }
    });
}




// Variable pour suivre l'état du tri (croissant ou décroissant)
let isDateSortedAscending = true;

// Fonction pour trier les tickets par date
const sortDateBtn = document.getElementById("sortDateBtn");
if (sortDateBtn) {
    sortDateBtn.addEventListener("click", function () {
        const rows = Array.from(document.querySelectorAll("table.ticket-table tbody tr"));

        // Déterminer l'ordre de tri et trier les lignes
        rows.sort((a, b) => {
            const dateA = new Date(a.getAttribute("data-date"));
            const dateB = new Date(b.getAttribute("data-date"));

            return isDateSortedAscending ? dateA - dateB : dateB - dateA;
        });

        // Réorganiser les lignes triées dans le tableau
        const tbody = document.querySelector("table.ticket-table tbody");
        rows.forEach(row => tbody.appendChild(row));

        // Inverser l'état du tri pour le prochain clic
        isDateSortedAscending = !isDateSortedAscending;

        // Mise à jour de l’icône de tri
        const icon = sortDateBtn.querySelector("i");
        if (icon) {
            icon.classList.toggle("fa-arrow-up", isDateSortedAscending);
            icon.classList.toggle("fa-arrow-down", !isDateSortedAscending);
        }
    });
}






document.addEventListener("DOMContentLoaded", function () {
    const exportBtn = document.getElementById("export-btn");

    // Affiche immédiatement le bouton si la page est en haut
    if (window.scrollY === 0) {
        exportBtn.classList.add("show");
    }

    // Affiche ou cache le bouton en fonction du scroll
    window.addEventListener("scroll", function () {
        if (window.scrollY === 0) {
            exportBtn.classList.add("show");
        } else {
            exportBtn.classList.remove("show");
        }
    });

    // Gestion du clic pour l'exportation
    exportBtn.addEventListener("click", function () {
        window.location.href = "/export_tickets"; // Redirection vers la route Flask pour exporter
    });
});



// champs de recherche 



    document.addEventListener("DOMContentLoaded", function () {
        const filterInput = document.getElementById("filter-name"); // Champ de recherche
        const ticketRows = document.querySelectorAll(".ticket-row"); // Toutes les lignes

        // Ajout d'un écouteur d'événement sur l'input
        filterInput.addEventListener("input", function () {
            const query = filterInput.value.toLowerCase().trim(); // Texte recherché en minuscule

            // Boucle sur chaque ligne de ticket
            ticketRows.forEach(row => {
                const nameCell = row.querySelector(".name-cell"); // Cellule contenant le nom
                if (nameCell && nameCell.textContent.toLowerCase().includes(query)) {
                    row.style.display = ""; // Affiche la ligne
                } else {
                    row.style.display = "none"; // Masque la ligne
                }
            });
        });
    });



    function filterByNameAdmin() {
        const filterValue = document.getElementById("filter-name-admin").value.toLowerCase();
        const rows = document.querySelectorAll(".ticket-row-admin");
    
        rows.forEach(row => {
            const name = row.getAttribute("data-name").toLowerCase();
            if (filterValue === "" || name.includes(filterValue)) {
                row.style.display = ""; // Affiche la ligne
            } else {
                row.style.display = "none"; // Cache la ligne
            }
        });
    }
    
    //filtre pour le statut 

    function filterByStatus() {
        const selectedStatus = document.getElementById("filter-status").value.toLowerCase();
        const rows = document.querySelectorAll("table.ticket-table tbody tr");
    
        rows.forEach(row => {
            const statusCell = row.querySelector("td:nth-child(7)"); // Colonne "Statut"
            const statusText = statusCell.textContent.toLowerCase();
    
            // Montrer ou cacher la ligne en fonction du statut sélectionné
            if (selectedStatus === "" || statusText.includes(selectedStatus)) {
                row.style.display = ""; // Afficher la ligne
            } else {
                row.style.display = "none"; // Masquer la ligne
            }
        });
    }
    



// Filtrer par statut
function filterByStatusAdmin() {
    const selectedStatus = document.getElementById("filter-status-admin").value.toLowerCase();
    const rows = document.querySelectorAll("table.ticket-table tbody tr");

    rows.forEach(row => {
        const status = row.getAttribute("data-status").toLowerCase();
        row.style.display = selectedStatus === "" || status.includes(selectedStatus) ? "" : "none";
    });
}


    
// fonction recup date auto
document.addEventListener("DOMContentLoaded", function () {
    const nextAvailableBtn = document.getElementById("next-available-btn");
    const slotTimeInput = document.getElementById("slot_time");
    const urgentCheckbox = document.getElementById("urgent"); // Sélectionne la case "Urgent"

    nextAvailableBtn.addEventListener("click", function () {
        // Vérifie si la case "Urgente" est cochée
        const isUrgent = urgentCheckbox.checked;

        // Envoie une requête avec l'état de l'urgence
        fetch("/get_next_available_date", {
            method: "POST", // On utilise POST pour transmettre des données
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ urgent: isUrgent }), // Envoie l'état de l'urgence
        })
            .then(response => response.json())
            .then(data => {
                if (data.next_available_date) {
                    slotTimeInput.value = data.next_available_date; // Insère la date dans le champ
                } else if (data.error) {
                    alert(data.error); // Affiche une erreur en cas de problème
                } else {
                    alert("Aucun créneau disponible trouvé !");
                }
            })
            .catch(error => {
                console.error("Erreur lors de la récupération des données :", error);
                alert("Impossible de récupérer les créneaux.");
            });
    });
});


// Initialisation de Flatpickr pour le sélecteur de plage de dates
document.addEventListener("DOMContentLoaded", function () {
    const dateRangeInput = document.getElementById('date_range');
    const form = document.querySelector('form');

    flatpickr(dateRangeInput, {
        mode: "range", // Mode plage pour permettre une date de début et de fin
        dateFormat: "d/m/Y H:i", // Format attendu
        enableTime: true, // Active la sélection de l'heure
        time_24hr: true, // Utilise le format 24 heures
        defaultDate: null, // Supprime la valeur par défaut
        onClose: function (selectedDates, dateStr, instance) {
            console.log("DEBUG: Dates sélectionnées lors de la fermeture :", selectedDates);

            // Si une seule date est sélectionnée, ajoute une heure de fin par défaut
            if (selectedDates.length === 1) {
                const start = selectedDates[0];
                const end = new Date(start.getTime() + 60 * 60 * 1000); // Ajoute 1 heure par défaut
                instance.setDate([start, end]); // Définit une plage avec une heure de fin par défaut
                console.log(`DEBUG: Plage ajustée automatiquement: ${start} au ${end}`);
            }
        }
    });

    // Vérifie la validité des dates avant l'envoi du formulaire
    form.addEventListener('submit', function (e) {
        const dateRangeValue = dateRangeInput.value.trim();
        console.log('DEBUG: Valeur soumise :', dateRangeValue);

        // Si aucune plage n'est saisie
        if (!dateRangeValue) {
            alert('Veuillez sélectionner une plage valide.');
            e.preventDefault();
            return;
        }

        // Vérifie que le format correspond à une plage "début au fin"
        const dates = dateRangeValue.split(' to ');
        if (dates.length < 1 || dates.length > 2) {
            alert('Format de date invalide. Veuillez sélectionner une plage valide.');
            e.preventDefault();
            return;
        }

        // Si une seule date est sélectionnée, ajoute une heure de fin par défaut
        if (dates.length === 1) {
            try {
                const startDate = flatpickr.parseDate(dates[0].trim(), "d/m/Y H:i");
                if (!startDate) {
                    alert('Date de début invalide. Veuillez sélectionner une plage valide.');
                    e.preventDefault();
                    return;
                }

                const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Ajoute 1 heure
                dateRangeInput.value = `${flatpickr.formatDate(startDate, "d/m/Y H:i")} to ${flatpickr.formatDate(endDate, "d/m/Y H:i")}`;
                console.log('DEBUG: Plage ajustée automatiquement avant soumission :', dateRangeInput.value);
            } catch (error) {
                console.error('Erreur lors de l\'ajout d\'une heure par défaut :', error);
                alert('Erreur dans la plage de dates. Veuillez réessayer.');
                e.preventDefault();
                return;
            }
        }
    });

    // Écouteur pour déboguer les changements dans le champ
    dateRangeInput.addEventListener('change', function () {
        console.log('DEBUG: Date sélectionnée :', dateRangeInput.value);
    });
});










document.addEventListener('DOMContentLoaded', function () {
    let isDateSortedAscending = true;  // Conserver l'état du tri actuel
    let currentNameFilter = "";
    let currentStatusFilter = "";

    function fetchAndUpdateTickets() {
        const scrollPosition = window.scrollY;  // Sauvegarde de la position actuelle

        fetch('/get_tickets', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                updateTicketTable(data);  // Met à jour la table avec les tickets récupérés
                updateCalendarEvents(data);  // Synchronise le calendrier
                applyFilters();  // Appliquer immédiatement les filtres après mise à jour
                sortTicketsByDate(isDateSortedAscending ? 'asc' : 'desc');  // Réappliquer le tri
                window.scrollTo(0, scrollPosition);  // Restaure la position de la page
            } else {
                console.warn("Aucun ticket récupéré ou format invalide.");
            }
        })
        .catch(error => console.error('Erreur lors de la récupération des tickets :', error));
    }

    function updateTicketTable(tickets) {
        const tbody = document.querySelector('table.ticket-table tbody');
        tbody.innerHTML = '';  // Vider les anciennes lignes

        tickets.forEach(ticket => {
            const startDate = formatDate(ticket.start);  // Vérification et formatage corrects de la date de début
            const endDate = formatDate(ticket.endFormatted || calculateDefaultEndDate(ticket.start));

            const row = document.createElement('tr');
            row.classList.add('ticket-row');  // Utilise une classe générique pour les deux rôles
            row.setAttribute('data-date', ticket.start);  // Utilisé pour le tri
            row.setAttribute('data-status', ticket.status.toLowerCase());  // Utilisé pour les filtres

            // Ajout dynamique de la colonne Action uniquement pour la page admin
            const actionColumn = document.body.classList.contains('admin-page') ? `
                <td>
                    <div class="action-buttons">
                        <a href="/edit_ticket/${ticket.id}" class="btn admin-btn modify-btn">Modifier</a>
                        <button type="button" class="btn admin-btn delete-btn" onclick="deleteTicket(${ticket.id})">Supprimer</button>
                    </div>
                </td>` : '';

            row.innerHTML = `
                <td>${ticket.id}</td>
                <td class="name-cell">${ticket.extendedProps?.first_name || "Inconnu"}</td>
                <td>${ticket.extendedProps?.email || "Non défini"}</td>
                <td>${ticket.title}</td>
                <td>${ticket.extendedProps?.description || "Aucune description"}</td>
                <td>
                    Début : ${startDate}<br>
                    Fin : ${endDate}
                </td>
                <td>${ticket.status}</td>
                <td>${ticket.admin_comment || "Aucun"}</td>
                ${actionColumn}
            `;

            tbody.appendChild(row);
        });
    }

    function updateCalendarEvents(tickets) {
        if (typeof updateCalendar === 'function') {
            updateCalendar(tickets);  // Synchronise les événements du calendrier côté client
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "Non défini";  // Si la date est manquante
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "Invalid Date";  // Gestion des dates invalides
        return date.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function calculateDefaultEndDate(startStr) {
        const startDate = new Date(startStr);
        if (isNaN(startDate.getTime())) return "Non défini";  // Si la date de début est invalide
        startDate.setHours(startDate.getHours() + 1);  // Ajouter 1 heure
        return startDate.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function sortTicketsByDate(order) {
        const rows = Array.from(document.querySelectorAll("table.ticket-table tbody tr"));

        rows.sort((a, b) => {
            const dateA = new Date(a.getAttribute("data-date"));
            const dateB = new Date(b.getAttribute("data-date"));
            return order === 'asc' ? dateA - dateB : dateB - dateA;
        });

        const tbody = document.querySelector("table.ticket-table tbody");
        rows.forEach(row => tbody.appendChild(row));
    }

    const sortDateBtn = document.getElementById("sortDateBtn");
    if (sortDateBtn) {
        sortDateBtn.addEventListener("click", function () {
            isDateSortedAscending = !isDateSortedAscending;
            sortTicketsByDate(isDateSortedAscending ? 'asc' : 'desc');

            const icon = sortDateBtn.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-arrow-up", isDateSortedAscending);
                icon.classList.toggle("fa-arrow-down", !isDateSortedAscending);
            }
        });
    }

    function deleteTicket(ticketId) {
        fetch(`/delete_ticket/${ticketId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then(response => {
            if (response.ok) {
                fetchAndUpdateTickets();  // Mise à jour de la liste des tickets et du calendrier
            } else {
                alert('Erreur lors de la suppression du ticket');
            }
        })
        .catch(error => console.error('Erreur lors de la suppression du ticket :', error));
    }

    document.getElementById('filter-name-admin').addEventListener('input', function () {
        currentNameFilter = this.value.toLowerCase().trim();
        applyFilters();
    });

    document.getElementById('filter-status-admin').addEventListener('input', function () {
        currentStatusFilter = this.value.toLowerCase().trim();
        applyFilters();
    });

    fetchAndUpdateTickets();  // Appel initial

    setInterval(fetchAndUpdateTickets, 10000);  // Auto-update toutes les 10 secondes
});








