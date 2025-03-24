document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM chargé");

    // Récupération des éléments
    const mobileMenu = document.getElementById('mobile-menu');
    const closeIcon = document.querySelector('.close-icon');
    const navLinks = document.getElementById('nav-links');
    const navLinkItems = document.querySelectorAll('.nav-links li');
    const navbar = document.querySelector('.navbar');
    const videoContainer = document.querySelector('.video-container');
    const scrollButton = document.getElementById('scroll-button');
    const backToTopButton = document.getElementById('back-to-top');
    const form = document.getElementById("contact-form");
    const countersSection = document.getElementById('counters');

    let menuOpen = false;

    // === Gestion du menu hamburger ===
    if (mobileMenu && closeIcon && navLinks) {
        mobileMenu.addEventListener('click', (event) => {
            event.preventDefault();
            menuOpen = !menuOpen;
            navLinks.classList.toggle('nav-active', menuOpen);

            closeIcon.style.display = menuOpen ? 'block' : 'none';
            mobileMenu.style.display = menuOpen ? 'none' : 'block';
        });

        closeIcon.addEventListener('click', () => {
            menuOpen = false;
            navLinks.classList.remove('nav-active');
            closeIcon.style.display = 'none';
            mobileMenu.style.display = 'block';
        });

        navLinks.addEventListener('click', () => {
            menuOpen = false;
            navLinks.classList.remove('nav-active');
            closeIcon.style.display = 'none';
            mobileMenu.style.display = 'block';
        });
    }

    // === Gestion de la barre de navigation (scroll transparent/solide) ===
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                navbar.classList.remove('transparent');
                navbar.classList.add('solid');
            } else {
                navbar.classList.remove('solid');
                navbar.classList.add('transparent');
            }

            updateActiveSection();
        });
    }

    // === Bouton retour en haut ===
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            backToTopButton.classList.toggle('show', window.scrollY > 300);
        });

        backToTopButton.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    } else {
        console.warn("Bouton retour en haut introuvable");
    }

    // === Mise à jour des sections actives ===
    function updateActiveSection() {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-links a');

        let currentSection = '';
        if (window.scrollY === 0 || (videoContainer && window.scrollY < videoContainer.offsetHeight)) {
            navLinks.forEach(link => link.classList.remove('active'));
            return;
        }

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (
                window.scrollY + window.innerHeight / 2 >= sectionTop &&
                window.scrollY + window.innerHeight / 2 <= sectionTop + sectionHeight
            ) {
                currentSection = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(currentSection)) {
                link.classList.add('active');
            }
        });
    }

    // === Défilement en douceur ===
    if (scrollButton) {
        scrollButton.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSection = document.querySelector(scrollButton.getAttribute('data-scroll-target'));
            if (targetSection) {
                const navbarHeight = navbar ? navbar.offsetHeight : 0;
                window.scrollTo({
                    top: targetSection.offsetTop - navbarHeight,
                    behavior: 'smooth'
                });
            }
        });
    }

    // === Gestion du formulaire ===
if (form) {
    console.log("Formulaire détecté :", form);

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = document.getElementById("name").value;
        const email = document.getElementById("email").value;
        const message = document.getElementById("message").value;

        console.log("Formulaire soumis !");
        console.log("Données collectées :", { name, email, message });

        const confirmationContainer = document.getElementById("confirmation-message");

        try {
            const response = await fetch("https://formspree.io/f/xqazaayq", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, message }),
            });

            if (response.ok) {
                // Affiche le message de confirmation
                confirmationContainer.style.display = "block";
                confirmationContainer.innerText = "Votre message a été envoyé avec succès !";
                confirmationContainer.style.color = "white";
                confirmationContainer.style.backgroundColor = "#52b3e4";
                confirmationContainer.style.padding = "10px";
                confirmationContainer.style.borderRadius = "5px";
                confirmationContainer.style.marginTop = "10px";

                form.reset(); // Réinitialise le formulaire

                // Cache le message après 5 secondes
                setTimeout(() => {
                    confirmationContainer.style.display = "none";
                }, 5000);
            } else {
                // Affiche un message d'erreur
                confirmationContainer.style.display = "block";
                confirmationContainer.innerText = "Erreur lors de l'envoi. Veuillez réessayer.";
                confirmationContainer.style.color = "white";
                confirmationContainer.style.backgroundColor = "#e74c3c";
                confirmationContainer.style.padding = "10px";
                confirmationContainer.style.borderRadius = "5px";
                confirmationContainer.style.marginTop = "10px";
            }
        } catch (error) {
            console.error("Erreur :", error);
            confirmationContainer.style.display = "block";
            confirmationContainer.innerText = "Problème de connexion. Veuillez réessayer.";
            confirmationContainer.style.color = "white";
            confirmationContainer.style.backgroundColor = "#e74c3c";
            confirmationContainer.style.padding = "10px";
            confirmationContainer.style.borderRadius = "5px";
            confirmationContainer.style.marginTop = "10px";
        }
    });
} else {
    console.error("Formulaire introuvable");
}

    // === Animation des compteurs ===
    function animateCounter(element, endValue) {
        let startValue = 0;
        const duration = 10000; // 10 secondes
        const increment = Math.ceil(endValue / (duration / 30));

        const counter = setInterval(() => {
            startValue += increment;
            if (startValue >= endValue) {
                startValue = endValue;
                clearInterval(counter);
            }
            element.innerText = startValue;
        }, 30);
    }

    if (countersSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counters = document.querySelectorAll('.counter .number span');
                    counters.forEach(counter => {
                        const endValue = parseInt(counter.getAttribute('data-end-value'));
                        counter.innerText = '0';
                        animateCounter(counter, endValue);
                    });
                }
            });
        }, { threshold: 0.5 });

        observer.observe(countersSection);
    } else {
        console.warn("Section des compteurs introuvable");
    }
});
