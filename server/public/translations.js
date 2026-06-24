const translations = {
  en: {
    // Site identity
    title: "CMCEN",
    site_name_full:
      "Canadian Military Communications and Electronics Network",

    // Header and navigation
    donate_now: "Donate",
    search_site: "Search the site",
    search_placeholder: "Search the site",
    search_submit: "Search",
    search_page_title: "Search | CMCEN / RCMCE",
    search_page_eyebrow: "Site search",
    search_page_heading: "Search CMCEN",
    search_page_intro:
      "Find events, retirement messages, and public site pages.",
    search_enter_query:
      "Enter at least two characters to search the site.",
    search_loading: "Searching...",
    search_results_count:
      "{count} results for \"{query}\"",
    search_no_results:
      "No results found for \"{query}\".",
    search_error:
      "Search is unavailable right now. Please try again.",
    search_type_event: "Event",
    search_type_retirement_message:
      "Retirement message",
    search_type_page: "Page",
    account: "Account",
    signout_btn: "Sign out",
    menu_about: "About",
    menu_contact: "Contact",
    menu_connections: "Connections",

    menu_about_title: "About",
    menu_about_option_1: "About the C&E Family",
    menu_about_option_2: "About the C&E Branch",
    menu_about_option_3: "About the C&E Association",
    menu_about_option_4: "About the C&E Foundation",
    menu_about_option_5: "About the C&E Museum",
    menu_about_option_6: "Site Ownership & Disclaimer",

    menu_doctrine_title:
      "Doctrine & Professional Development",
    menu_doctrine_option_1: "CAF Doctrine Hub",
    menu_doctrine_option_2: "Professional Awards",

    menu_news_title: "News & Events",
    menu_news_option_1: "Calendar",
    menu_news_option_2: "Submit or Edit an Event",
    menu_news_option_3: "News & Stories",
    menu_news_option_4: "Last Post",
    menu_news_option_5: "Retirement Messages",
    menu_news_option_6: "Certificate Requests",
    menu_news_option_7: "Promotions",
    menu_news_option_8: "History Project",
    menu_news_option_9: "Photo & Video Gallery",
    menu_review_events: "Review Events",

    menu_benefits_title: "Benefits",
    menu_benefits_option_1: "Veteran Services",
    menu_benefits_option_2: "CFMWS Programs",
    menu_benefits_option_3: "Bursaries & Grants",
    menu_benefits_option_4:
      "Affiliate Offers (TD Insurance, etc.)",
    menu_benefits_option_5: "Support Our Troops",

    // Authentication
    login_page_title:
      "Member Login | CMCEN / RCMCE",
    login_title: "Sign in",
    login_btn: "Sign in",
    login_instruction:
      "Enter your registered username and password.",
    member_login_heading: "Member Access",
    member_login_intro:
      "For C&E Family members, contributors and staff.",
    account_help:
      "Need help accessing your account?",

    register_page_title:
      "Register | CMCEN / RCMCE",
    register_title: "Register",
    register_btn: "Create account",
    member_registration: "Member registration",
    create_account: "Create an account",
    have_account: "Already have an account?",
    no_account: "Don't have an account?",

    // Account fields
    username: "Username",
    password: "Password",
    password_confirmation: "Password confirmation",
    email: "Email",
    account_name: "Account name",
    first_name: "First name",
    last_name: "Last name",
    address_line_1: "Address line 1",
    address_line_2: "Address line 2",
    city: "City",
    country: "Country",
    state_province: "State/province",
    postal_code: "Zip/postal code",
    rank: "Rank",
    post_nominals: "Post nominals",
    company: "Company",
    status: "Status",
    affiliation_element: "Affiliation/element",
    trade: "MOSID/MOC/Trade",
    trade_other: "MOSID/MOC/Trade (Other)",
    current_unit: "Current unit",
    username_placeholder: "Enter your username",
    password_placeholder: "Enter your password",
    email_placeholder: "Enter your email",
    account_name_placeholder: "Enter your name",
    password_create_placeholder:
      "Create a password",
    password_confirm_placeholder:
      "Confirm your password",
    passwords_do_not_match:
      "Passwords do not match.",
    status_regular: "Regular",
    status_reserve: "Reserve",
    status_honourary: "Honourary",
    status_civilian: "Civilian",
    status_retired: "Retired",
    status_released: "Released",
    status_other: "Other",
    element_army: "Army",
    element_navy: "Navy",
    element_air_force: "Air Force",
    element_other: "Other",

    // Dashboard
    dashboard_title: "Account Dashboard",
    dashboard_welcome: "Welcome, {name}",
    loading_text: "Loading...",
    editable_tag: "Editable",
    field_username: "Username",
    field_email: "Email",
    field_address: "Address",
    field_account_name: "Account name",
    field_role: "Role",
    dashboard_page_title:
      "Account Dashboard | CMCEN / RCMCE",

    dashboard_member_account:
      "Member account",

    dashboard_account_details:
      "Account details",

    dashboard_available_actions:
      "Available actions",

    field_content_areas:
      "Content areas",

    no_content_areas:
      "None assigned",

    access_level:
      "Access level",

    dashboard_load_error:
      "Could not load account information.",

    role_subscriber:
      "Subscriber",

    role_contributor:
      "Contributor",

    role_author:
      "Author",

    role_editor:
      "Editor",

    role_administrator:
      "Administrator",

    role_description_subscriber:
      "You may access member-only sections and services.",

    role_description_contributor:
      "You may create and submit content for editorial review.",

    role_description_author:
      "You may create and publish content within your assigned areas.",

    role_description_editor:
      "You may review and publish submitted content.",

    role_description_administrator:
      "You have full publishing and account-management access.",

    dashboard_action_calendar:
      "View calendar",

    dashboard_action_calendar_description:
      "View published upcoming events.",

    dashboard_action_submit_retirement:
      "Submit a retirement message",

    dashboard_action_submit_retirement_description:
      "Recognize a retiring member with a message for review.",

    dashboard_action_submit_event:
      "Submit an event",

    dashboard_action_submit_event_description:
      "Create a bilingual event for review.",

    dashboard_action_review_events:
      "Review events",

    dashboard_action_review_events_description:
      "Review, publish or reject pending events.",

    // Event submission
    submit_event_title: "Submit an Event",

    // Public calendar
    calendar_title: "Events Calendar",
    calendar_intro:
      "Upcoming events in chronological order.",
    loading_events: "Loading events...",
    no_upcoming_events:
      "There are no upcoming events.",
    events_load_error:
      "Events could not be loaded.",
    all_day: "All day",

    // Event review
    review_events_title: "Review Events",
    review_events_intro:
      "Review pending event submissions.",
    submitted_by: "Submitted by",
    submitted_on: "Submitted on",
    event_date_label: "Event date",
    event_location_label: "Location",
    unknown_user: "Unknown user",
    translation_missing:
      "Translation not provided",
    rejection_reason_label:
      "Reason for rejection",
    rejection_reason_placeholder:
      "Explain what needs to be corrected...",
    rejection_reason_required:
      "Enter a reason before rejecting this event.",
    publish_event: "Publish",
    reject_event: "Reject",
    no_pending_events:
      "There are no events awaiting review.",
    review_access_denied:
      "You do not have permission to review events.",
    review_failed:
      "The event could not be reviewed.",
    review_load_error:
      "The review queue could not be loaded.",
    review_events_page_title:
      "Review Events | CMCEN / RCMCE",

    review_workflow_eyebrow:
      "Editorial workflow",

    review_pending_submission:
      "Pending event submission",

    review_status_pending:
      "Pending",

    review_pending_event_singular:
      "event pending",

    review_pending_events_plural:
      "events pending",

    review_content_area:
      "Content area",

    review_title_label:
      "Title",

    review_description_label:
      "Description",

    review_decision:
      "Review decision",

    rejection_reason_help:
      "A reason is required only when rejecting the event.",

    review_publishing:
      "Publishing…",

    review_rejecting:
      "Rejecting…",

    review_publish_success:
      "Event published successfully.",

    review_reject_success:
      "Event rejected successfully.",

    // About page
    about_family_heading:
      "About the C&E Family",
    about_family_para_1:
      "Introduce the C&E Family as a unified whole and describe the relationships between its four constituent entities—the Branch, Association, Foundation and Museum—and the services they support.",

    // Footer
    site_ownership_label: "Site ownership",
    site_ownership_statement:
      "This website is owned and operated by the C&E Association, a not-for-profit organization. It is not operated by the Government of Canada or the Department of National Defence.",
    footer_mission:
      "Connecting members, supporting veterans, and preserving the history of the Branch.",
    footer_quick_links: "Quick links",
    footer_contact: "Contact",
    footer_information: "Information",
    footer_address_label: "Address",
    contact_form_link: "Contact form",
    subscribe: "Subscribe",
    privacy_policy: "Privacy Policy",
    casl_disclosure: "CASL Disclosure",
    accessibility: "Accessibility",
    footer_copyright:
      "C&E Association. All rights reserved.",
    submit_event_page_title:
      "Submit an Event | CMCEN / RCMCE",

    event_submission_eyebrow:
      "Event submission",

    submit_event_intro:
      "Propose an event for publication in the C&E Calendar.",

    event_language_note:
      "At least one event title is required. Add both language versions whenever possible.",

    event_shared_details:
      "Shared details",

    event_schedule_heading:
      "Schedule",

    event_all_day:
      "All-day event",

    event_start_date:
      "Start date",

    event_start_time:
      "Start time",

    event_end_date:
      "End date",

    event_end_time:
      "End time",

    event_end_date_hint:
      "Optional for an all-day event.",

    event_local_time_note:
      "Times are the local time of the event.",

    event_publish_now:
      "Publish immediately",

    event_publish_now_hint:
      "Skip the review queue and publish this event now.",

    event_review_note:
      "Your event will be sent to an editor for review.",

    event_submit_button:
      "Submit event",

    event_submitting:
      "Submitting…",

    event_title_required:
      "Enter an English or French event title.",

    event_start_required:
      "Choose a start date.",

    event_timed_fields_required:
      "Choose a start date, start time, end date and end time.",

    event_end_after_start:
      "The event must end after it starts.",

    event_access_denied_title:
      "Access denied",

    event_access_denied:
      "Your account does not have permission to submit events.",

    event_permission_error:
      "Could not verify your event-submission permissions.",

    event_submit_error:
      "Could not submit the event.",

    event_submit_success_pending:
      "Event submitted for review.",

    event_submit_success_published:
      "Event published successfully.",
    event_hour:
      "Hour",

    event_minute:
      "Minute",
    event_details_eyebrow:
      "Event information",

    event_details_heading:
      "Event details",

    event_city:
      "City",

    event_city_placeholder:
      "Kingston",

    event_province_region:
      "Province or region",

    event_organizing_entity:
      "Organizing entity",

    event_type:
      "Event type",

    event_select_option:
      "Select an option",

    region_ab:
      "Alberta",

    region_bc:
      "British Columbia",

    region_mb:
      "Manitoba",

    region_nb:
      "New Brunswick",

    region_nl:
      "Newfoundland and Labrador",

    region_ns:
      "Nova Scotia",

    region_nt:
      "Northwest Territories",

    region_nu:
      "Nunavut",

    region_on:
      "Ontario",

    region_pe:
      "Prince Edward Island",

    region_qc:
      "Quebec",

    region_sk:
      "Saskatchewan",

    region_yt:
      "Yukon",

    region_international:
      "International",

    entity_branch:
      "C&E Branch",

    entity_association:
      "C&E Association",

    entity_foundation:
      "C&E Foundation",

    entity_museum:
      "C&E Museum",

    event_type_conference:
      "Conference",

    event_type_mess_function:
      "Mess function",

    event_type_ceremony:
      "Ceremony",

    event_type_training:
      "Training",

    event_type_social:
      "Social",

    event_type_other:
      "Other",
    event_registration_label:
      "Registration link or instructions",

    event_registration_placeholder_en:
      "Enter a registration link or instructions",

    event_registration_placeholder_fr:
      "Enter a registration link or instructions in French",

    event_registration_optional:
      "Optional",

    event_timezone:
      "Event timezone",

    event_select_timezone:
      "Select a timezone",

    event_timezone_hint:
      "Choose the timezone where the event takes place.",

    timezone_newfoundland:
      "Newfoundland Time",

    timezone_atlantic:
      "Atlantic Time",

    timezone_eastern:
      "Eastern Time",

    timezone_central:
      "Central Time",

    timezone_mountain:
      "Mountain Time",

    timezone_pacific:
      "Pacific Time",
    event_submitter_eyebrow:
      "Submission contact",

    event_submitter_heading:
      "Submitter information",

    event_submitter_intro:
      "Enter the contact information for the person responsible for this event submission.",

    event_submitter_rank:
      "Rank",

    event_submitter_rank_placeholder:
      "Capt",

    event_submitter_first_name:
      "First name",

    event_submitter_last_name:
      "Last name",

    event_submitter_unit_role:
      "Unit or role",

    event_submitter_unit_role_placeholder:
      "2 CMBG HQ & Sig Sqn",

    event_submitter_email:
      "Contact email",

    event_submitter_email_hint:
      "Submission and status confirmations will be sent here.",

    event_submitter_phone:
      "Phone number",

    event_optional:
      "Optional",

    event_authorization_eyebrow:
      "Publication authorization",

    event_authorization_heading:
      "Chain-of-command confirmation",

    event_permission_confirmation:
      "I confirm I have permission from the chain of command to publish this event.",

    event_permission_confirmation_hint:
      "This confirmation is required before the event can be submitted for review or publication.",
    event_permission_required:
      "You must confirm chain-of-command permission before submitting the event.",
    review_event_information:
      "Event information",

    review_submitter_record:
      "Submitter record",

    review_authorization_record:
      "Publication authorization",

    review_permission_status:
      "Permission status",

    review_permission_confirmed:
      "Confirmed",

    review_permission_not_recorded:
      "Not recorded",

    review_confirmed_by:
      "Confirmed by",

    review_confirmed_on:
      "Confirmed on",
    my_events_eyebrow:
      "Event management",

    my_events_heading:
      "My Events",

    my_events_intro:
      "View and update events you have previously submitted.",
    my_events_untitled:
      "Untitled event",

    my_events_empty:
      "You have not submitted any events yet.",

    my_events_load_error:
      "Could not load your events.",

    my_events_count_singular:
      "1 event",

    my_events_count_plural:
      "{count} events",

    my_events_last_updated:
      "Last updated",

    my_events_rejection_reason:
      "Rejection reason",

    my_events_edit:
      "Edit event",

    my_events_edit_resubmit:
      "Edit and resubmit",

    my_events_status_draft:
      "Draft",

    my_events_status_pending:
      "Pending review",

    my_events_status_published:
      "Published",

    my_events_status_rejected:
      "Rejected",
    submit_new_event_tab:
      "Submit New Event",
    event_update_success:
      "The event was updated and submitted successfully.",
    edit_event_tab:
      "Edit Event",

    edit_event_heading:
      "Edit Event",

    edit_event_intro:
      "Update this event and submit the changes for review.",

    save_event_changes:
      "Save Changes",

    submit_event_heading:
      "Submit an Event",

    submit_event_intro:
      "Submit an event for publication in the C&E Calendar.",

    submit_event_button:
      "Submit Event",
    event_edit_loading:
      "Loading event details...",
    home_hero_eyebrow:
      "Canadian Military Communications and Electronics Network",

    home_hero_title:
      "Connecting the C&E Family",

    home_hero_intro:
      "A shared home for serving members, veterans, families, associations, and organizations connected to Canada's Communications and Electronics community.",

    home_explore_family:
      "Explore the C&E Family",

    home_view_calendar:
      "View the Calendar",

    home_family_title:
      "The C&E Family",

    home_branch_title:
      "The Branch",

    home_branch_text:
      "Learn about the military branch, its identity, leadership, and role.",

    home_association_title:
      "The Association",

    home_association_text:
      "Connect with the national community of serving and former members.",

    home_foundation_title:
      "The Foundation",

    home_foundation_text:
      "See how the Foundation supports education, remembrance, and community initiatives.",

    home_museum_title:
      "The Museum",

    home_museum_text:
      "Explore the people, equipment, and stories that shaped Canada's military communications history.",

    home_learn_more:
      "Learn more",

    home_events_eyebrow:
      "Coming together",

    home_events_title:
      "Upcoming Events",

    home_events_intro:
      "Find reunions, ceremonies, conferences, training, and community events across the C&E Family.",

    home_browse_events:
      "Browse all events",

    home_stories_eyebrow:
      "News and remembrance",

    home_stories_title:
      "Stories From the Community",

    home_stories_intro:
      "Read the latest news, personal stories, historical features, promotions, and memorial notices.",

    home_read_stories:
      "Read news and stories",




    retirement_submit_eyebrow:
      "Retirement Messages",

    retirement_submit_title:
      "Submit a Retirement Message",

    retirement_submit_intro:
      "Recognize the career and service of a retiring member. All submissions are reviewed before publication.",

    retirement_retiree_heading:
      "Retiree Information",

    retirement_retiree_intro:
      "Enter the member's information as it should appear in the published message.",

    retirement_rank:
      "Rank at retirement",

    retirement_first_name:
      "First name",

    retirement_last_name:
      "Last name",

    retirement_trade_role:
      "Trade or role",

    retirement_years_service:
      "Years of service",

    retirement_date:
      "Retirement date",

    retirement_message_heading:
      "Retirement Message",

    retirement_message_intro:
      "Share a message recognizing the member's career, service, and contributions.",

    retirement_message_language:
      "Message language",

    retirement_message_text:
      "Message",

    retirement_message_minimum:
      "Minimum 100 characters.",

    retirement_photo:
      "Photo",

    retirement_photo_hint:
      "Optional. Upload a photo to include with the retirement message.",

    retirement_photo_invalid:
      "Upload an image file.",

    retirement_photo_too_large:
      "The photo must be 10 MB or smaller.",

    retirement_photo_upload_error:
      "Could not upload the photo. Please try again.",

    retirement_submitter_heading:
      "Submitter Information",

    retirement_submitter_intro:
      "This information is used for confirmation and review. It will not be published.",

    retirement_submitter_first_name:
      "First name",

    retirement_submitter_last_name:
      "Last name",

    retirement_submitter_relationship:
      "Relationship to retiree",

    retirement_submitter_email:
      "Email",

    retirement_submitter_unit:
      "Unit or organization",

    select_option:
      "Select an option",

    relationship_self:
      "Self",

    relationship_colleague:
      "Colleague",

    relationship_family:
      "Family",

    relationship_other:
      "Other",

    retirement_consent:
      "I confirm the retiree has consented to this publication.",

    retirement_submit_button:
      "Submit for Review",

    retirement_message_too_short:
      "The retirement message must contain at least 100 characters.",

    retirement_consent_required:
      "You must confirm the retiree has consented to publication.",

    retirement_access_denied:
      "Your account does not have permission to submit retirement messages.",

    retirement_permission_error:
      "Could not verify your retirement-message submission permissions.",

    retirement_submit_success:
      "Your retirement message has been submitted and is awaiting review.",

    retirement_submit_error:
      "Could not submit the retirement message. Please try again.",
  },






  /* 
  
  FRENCH ---------------------------------
  
  */

  fr: {
    // Identité du site
    title: "RCMCE",
    site_name_full:
      "Réseau canadien des communications et de l'électronique militaires",

    // En-tête et navigation
    donate_now: "Faire un don",
    search_site: "Rechercher sur le site",
    search_placeholder:
      "Rechercher sur le site",
    search_submit: "Rechercher",
    search_page_title:
      "Recherche | CMCEN / RCMCE",
    search_page_eyebrow:
      "Recherche sur le site",
    search_page_heading:
      "Rechercher dans le RCMCE",
    search_page_intro:
      "Trouvez des événements, des messages de retraite et des pages publiques du site.",
    search_enter_query:
      "Entrez au moins deux caractères pour rechercher sur le site.",
    search_loading: "Recherche en cours...",
    search_results_count:
      "{count} résultats pour « {query} »",
    search_no_results:
      "Aucun résultat trouvé pour « {query} ».",
    search_error:
      "La recherche n'est pas disponible pour le moment. Veuillez réessayer.",
    search_type_event: "Événement",
    search_type_retirement_message:
      "Message de retraite",
    search_type_page: "Page",
    account: "Compte",
    signout_btn: "Se déconnecter",
    menu_about: "À propos",
    menu_contact: "Nous joindre",
    menu_connections: "Connexions",

    menu_about_title: "À propos",
    menu_about_option_1:
      "À propos de la famille C&E",
    menu_about_option_2:
      "À propos de la Branche C&E",
    menu_about_option_3:
      "À propos de l'Association C&E",
    menu_about_option_4:
      "À propos de la Fondation C&E",
    menu_about_option_5:
      "À propos du Musée C&E",
    menu_about_option_6:
      "Propriété du site et avis de non-responsabilité",

    menu_doctrine_title:
      "Doctrine et perfectionnement professionnel",
    menu_doctrine_option_1:
      "Carrefour de la doctrine des FAC",
    menu_doctrine_option_2:
      "Prix professionnels",

    menu_news_title:
      "Nouvelles et événements",
    menu_news_option_1: "Calendrier",
    menu_news_option_2:
      "Soumettre ou modifier un événement",
    menu_news_option_3:
      "Nouvelles et récits",
    menu_news_option_4: "Dernier appel",
    menu_news_option_5:
      "Messages de départ à la retraite",
    menu_news_option_6:
      "Demandes de certificats",
    menu_news_option_7: "Promotions",
    menu_news_option_8:
      "Projet historique",
    menu_news_option_9:
      "Galerie de photos et vidéos",
    menu_review_events:
      "Réviser les événements",

    menu_benefits_title: "Avantages",
    menu_benefits_option_1:
      "Services aux vétérans",
    menu_benefits_option_2:
      "Programmes des SBMFC",
    menu_benefits_option_3:
      "Bourses et subventions",
    menu_benefits_option_4:
      "Offres des partenaires (Assurance TD, etc.)",
    menu_benefits_option_5:
      "Appuyons nos troupes",

    // Authentification
    login_page_title:
      "Connexion des membres | CMCEN / RCMCE",
    login_title: "Connexion",
    login_btn: "Se connecter",
    login_instruction:
      "Entrez votre nom d'utilisateur et votre mot de passe.",
    member_login_heading:
      "Accès des membres",
    member_login_intro:
      "Pour les membres, les collaborateurs et le personnel de l'Association.",
    account_help:
      "Besoin d'aide pour accéder à votre compte?",

    register_page_title:
      "Inscription | CMCEN / RCMCE",
    register_title: "Inscription",
    register_btn: "Créer un compte",
    member_registration:
      "Inscription des membres",
    create_account: "Créer un compte",
    have_account:
      "Vous avez déjà un compte?",
    no_account:
      "Vous n'avez pas de compte?",

    // Champs du compte
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    password_confirmation: "Confirmation du mot de passe",
    email: "Adresse courriel",
    account_name: "Nom du compte",
    first_name: "Prénom",
    last_name: "Nom de famille",
    address_line_1: "Adresse ligne 1",
    address_line_2: "Adresse ligne 2",
    city: "Ville",
    country: "Pays",
    state_province: "État/province",
    postal_code: "Code postal",
    rank: "Grade",
    post_nominals: "Lettres honorifiques",
    company: "Compagnie",
    status: "Statut",
    affiliation_element: "Affiliation/élément",
    trade: "ID SGPM/GPM/métier",
    trade_other: "ID SGPM/GPM/métier (autre)",
    current_unit: "Unité actuelle",
    username_placeholder:
      "Entrez votre nom d'utilisateur",
    password_placeholder:
      "Entrez votre mot de passe",
    email_placeholder:
      "Entrez votre adresse courriel",
    account_name_placeholder:
      "Entrez votre nom",
    password_create_placeholder:
      "Créez un mot de passe",
    password_confirm_placeholder:
      "Confirmez votre mot de passe",
    passwords_do_not_match:
      "Les mots de passe ne correspondent pas.",
    status_regular: "Force régulière",
    status_reserve: "Réserve",
    status_honourary: "Honoraire",
    status_civilian: "Civil",
    status_retired: "Retraité",
    status_released: "Libéré",
    status_other: "Autre",
    element_army: "Armée",
    element_navy: "Marine",
    element_air_force: "Force aérienne",
    element_other: "Autre",

    // Tableau de bord
    dashboard_title:
      "Tableau de bord du compte",
    dashboard_welcome:
      "Bienvenue, {name}",
    loading_text: "Chargement...",
    editable_tag: "Modifiable",
    field_username: "Nom d'utilisateur",
    field_email: "Adresse courriel",
    field_address: "Adresse",
    field_account_name: "Nom du compte",
    field_role: "Rôle",
    dashboard_page_title:
      "Tableau de bord | CMCEN / RCMCE",

    dashboard_member_account:
      "Compte de membre",

    dashboard_account_details:
      "Détails du compte",

    dashboard_available_actions:
      "Actions disponibles",

    field_content_areas:
      "Secteurs de contenu",

    no_content_areas:
      "Aucun secteur attribué",

    access_level:
      "Niveau d'accès",

    dashboard_load_error:
      "Impossible de charger les renseignements du compte.",

    role_subscriber:
      "Abonné",

    role_contributor:
      "Collaborateur",

    role_author:
      "Auteur",

    role_editor:
      "Réviseur",

    role_administrator:
      "Administrateur",

    role_description_subscriber:
      "Vous pouvez accéder aux sections et aux services réservés aux membres.",

    role_description_contributor:
      "Vous pouvez créer et soumettre du contenu aux fins de révision.",

    role_description_author:
      "Vous pouvez créer et publier du contenu dans les secteurs qui vous sont attribués.",

    role_description_editor:
      "Vous pouvez réviser et publier le contenu soumis.",

    role_description_administrator:
      "Vous disposez d'un accès complet à la publication et à la gestion des comptes.",

    dashboard_action_calendar:
      "Voir le calendrier",

    dashboard_action_calendar_description:
      "Consultez les événements à venir publiés.",

    dashboard_action_submit_retirement:
      "Soumettre un message de retraite",

    dashboard_action_submit_retirement_description:
      "Reconnaissez un membre prenant sa retraite avec un message aux fins de révision.",

    dashboard_action_submit_event:
      "Soumettre un événement",

    dashboard_action_submit_event_description:
      "Créez un événement bilingue aux fins de révision.",

    dashboard_action_review_events:
      "Réviser les événements",

    dashboard_action_review_events_description:
      "Révisez, publiez ou refusez les événements en attente.",

    // Soumission d'événements
    submit_event_title:
      "Soumettre un événement",

    // Calendrier public
    calendar_title: "Calendrier des événements",
    calendar_intro: "Événements à venir en ordre chronologique.",
    loading_events: "Chargement des événements...",
    no_upcoming_events:
      "Il n'y a aucun événement à venir.",
    events_load_error:
      "Impossible de charger les événements.",
    all_day: "Toute la journée",

    // Révision des événements
    review_events_title:
      "Réviser les événements",
    review_events_intro:
      "Révisez les événements soumis en attente.",
    submitted_by: "Soumis par",
    submitted_on: "Soumis le",
    event_date_label:
      "Date de l'événement",
    event_location_label: "Lieu",
    unknown_user:
      "Utilisateur inconnu",
    translation_missing:
      "Traduction non fournie",
    rejection_reason_label:
      "Motif du refus",
    rejection_reason_placeholder:
      "Expliquez les corrections nécessaires...",
    rejection_reason_required:
      "Indiquez un motif avant de refuser cet événement.",
    publish_event: "Publier",
    reject_event: "Refuser",
    no_pending_events:
      "Aucun événement n'est en attente de révision.",
    review_access_denied:
      "Vous n'avez pas l'autorisation de réviser les événements.",
    review_failed:
      "Impossible de réviser l'événement.",
    review_load_error:
      "Impossible de charger la file de révision.",
    review_events_page_title:
      "Réviser les événements | CMCEN / RCMCE",

    review_workflow_eyebrow:
      "Processus éditorial",

    review_pending_submission:
      "Événement en attente de révision",

    review_status_pending:
      "En attente",

    review_pending_event_singular:
      "événement en attente",

    review_pending_events_plural:
      "événements en attente",

    review_content_area:
      "Secteur de contenu",

    review_title_label:
      "Titre",

    review_description_label:
      "Description",

    review_decision:
      "Décision de révision",

    rejection_reason_help:
      "Un motif est requis uniquement lorsque l'événement est refusé.",

    review_publishing:
      "Publication en cours…",

    review_rejecting:
      "Refus en cours…",

    review_publish_success:
      "Événement publié avec succès.",

    review_reject_success:
      "Événement refusé avec succès.",

    // Page À propos
    about_family_heading:
      "À propos de la famille C&E",
    about_family_para_1:
      "Présenter la famille C&E comme un tout unifié et décrire les liens entre ses quatre entités constituantes — la Branche, l'Association, la Fondation et le Musée — ainsi que les services qu'elles soutiennent.",

    // Pied de page
    site_ownership_label:
      "Propriété du site",
    site_ownership_statement:
      "Ce site Web appartient à l'Association des C et E, un organisme sans but lucratif, qui en assure l'exploitation. Il n'est pas exploité par le gouvernement du Canada ni par le ministère de la Défense nationale.",
    footer_mission:
      "Rassembler les membres, soutenir les vétérans et préserver l'histoire de la Branche.",
    footer_quick_links: "Liens rapides",
    footer_contact: "Coordonnées",
    footer_information: "Renseignements",
    footer_address_label: "Adresse",
    contact_form_link:
      "Formulaire de contact",
    subscribe: "S'abonner",
    privacy_policy:
      "Politique de confidentialité",
    casl_disclosure:
      "Divulgation relative à la LCAP",
    accessibility: "Accessibilité",
    footer_copyright:
      "Association des C et E. Tous droits réservés.",
    submit_event_page_title:
      "Soumettre un événement | CMCEN / RCMCE",

    event_submission_eyebrow:
      "Soumission d'événement",

    submit_event_intro:
      "Saisissez les détails en anglais et en français côte à côte, puis définissez l'horaire.",

    event_language_note:
      "Au moins un titre d'événement est requis. Ajoutez les deux versions linguistiques lorsque possible.",

    event_shared_details:
      "Détails communs",

    event_schedule_heading:
      "Horaire",

    event_all_day:
      "Événement d'une journée entière",

    event_start_date:
      "Date de début",

    event_start_time:
      "Heure de début",

    event_end_date:
      "Date de fin",

    event_end_time:
      "Heure de fin",

    event_end_date_hint:
      "Facultative pour un événement d'une journée entière.",

    event_local_time_note:
      "Les heures utilisent le fuseau horaire local de votre appareil.",

    event_publish_now:
      "Publier immédiatement",

    event_publish_now_hint:
      "Ignorez la file de révision et publiez cet événement maintenant.",

    event_review_note:
      "Votre événement sera envoyé à un réviseur.",

    event_submit_button:
      "Soumettre l'événement",

    event_submitting:
      "Soumission en cours…",

    event_title_required:
      "Entrez un titre d'événement en anglais ou en français.",

    event_start_required:
      "Choisissez une date de début.",

    event_timed_fields_required:
      "Choisissez une date et une heure de début ainsi qu'une date et une heure de fin.",

    event_end_after_start:
      "L'événement doit se terminer après son début.",

    event_access_denied_title:
      "Accès refusé",

    event_access_denied:
      "Votre compte ne vous permet pas de soumettre des événements.",

    event_permission_error:
      "Impossible de vérifier vos autorisations de soumission.",

    event_submit_error:
      "Impossible de soumettre l'événement.",

    event_submit_success_pending:
      "Événement soumis aux fins de révision.",

    event_submit_success_published:
      "Événement publié avec succès.",
    event_hour:
      "Heure",

    event_minute:
      "Minute",
    event_details_eyebrow:
      "Renseignements sur l'événement",

    event_details_heading:
      "Détails de l'événement",

    event_city:
      "Ville",

    event_city_placeholder:
      "Kingston",

    event_province_region:
      "Province ou région",

    event_organizing_entity:
      "Entité organisatrice",

    event_type:
      "Type d'événement",

    event_select_option:
      "Sélectionnez une option",

    region_ab:
      "Alberta",

    region_bc:
      "Colombie-Britannique",

    region_mb:
      "Manitoba",

    region_nb:
      "Nouveau-Brunswick",

    region_nl:
      "Terre-Neuve-et-Labrador",

    region_ns:
      "Nouvelle-Écosse",

    region_nt:
      "Territoires du Nord-Ouest",

    region_nu:
      "Nunavut",

    region_on:
      "Ontario",

    region_pe:
      "Île-du-Prince-Édouard",

    region_qc:
      "Québec",

    region_sk:
      "Saskatchewan",

    region_yt:
      "Yukon",

    region_international:
      "International",

    entity_branch:
      "Branche des C et E",

    entity_association:
      "Association des C et E",

    entity_foundation:
      "Fondation des C et E",

    entity_museum:
      "Musée des C et E",

    event_type_conference:
      "Conférence",

    event_type_mess_function:
      "Activité de mess",

    event_type_ceremony:
      "Cérémonie",

    event_type_training:
      "Instruction",

    event_type_social:
      "Activité sociale",

    event_type_other:
      "Autre",
    event_registration_label:
      "Lien ou instructions d'inscription",

    event_registration_placeholder_en:
      "Entrez un lien ou des instructions d'inscription en anglais",

    event_registration_placeholder_fr:
      "Entrez un lien ou des instructions d'inscription",

    event_registration_optional:
      "Facultatif",

    event_timezone:
      "Fuseau horaire de l'événement",

    event_select_timezone:
      "Sélectionnez un fuseau horaire",

    event_timezone_hint:
      "Choisissez le fuseau horaire où l'événement aura lieu.",

    timezone_newfoundland:
      "Heure de Terre-Neuve",

    timezone_atlantic:
      "Heure de l'Atlantique",

    timezone_eastern:
      "Heure de l'Est",

    timezone_central:
      "Heure du Centre",

    timezone_mountain:
      "Heure des Rocheuses",

    timezone_pacific:
      "Heure du Pacifique",
    event_submitter_eyebrow:
      "Personne-ressource",

    event_submitter_heading:
      "Renseignements sur le demandeur",

    event_submitter_intro:
      "Entrez les coordonnées de la personne responsable de cette soumission d'événement.",

    event_submitter_rank:
      "Grade",

    event_submitter_rank_placeholder:
      "Capt",

    event_submitter_first_name:
      "Prénom",

    event_submitter_last_name:
      "Nom de famille",

    event_submitter_unit_role:
      "Unité ou rôle",

    event_submitter_unit_role_placeholder:
      "QG et Esc Trans 2 GBMC",

    event_submitter_email:
      "Courriel de la personne-ressource",

    event_submitter_email_hint:
      "Les confirmations de soumission et de statut seront envoyées à cette adresse.",

    event_submitter_phone:
      "Numéro de téléphone",

    event_optional:
      "Facultatif",

    event_authorization_eyebrow:
      "Autorisation de publication",

    event_authorization_heading:
      "Confirmation de la chaîne de commandement",

    event_permission_confirmation:
      "Je confirme avoir l'autorisation de la chaîne de commandement pour publier cet événement.",

    event_permission_confirmation_hint:
      "Cette confirmation est requise avant que l'événement puisse être soumis aux fins de révision ou de publication.",
    event_permission_required:
      "Vous devez confirmer l'autorisation de la chaîne de commandement avant de soumettre l'événement.",
    review_event_information:
      "Renseignements sur l'événement",

    review_submitter_record:
      "Dossier du demandeur",

    review_authorization_record:
      "Autorisation de publication",

    review_permission_status:
      "État de l'autorisation",

    review_permission_confirmed:
      "Confirmée",

    review_permission_not_recorded:
      "Non consignée",

    review_confirmed_by:
      "Confirmée par",

    review_confirmed_on:
      "Confirmée le",
    my_events_eyebrow:
      "Gestion des événements",

    my_events_heading:
      "Mes événements",

    my_events_intro:
      "Consultez et mettez à jour les événements que vous avez soumis.",
    my_events_untitled:
      "Événement sans titre",

    my_events_empty:
      "Vous n'avez encore soumis aucun événement.",

    my_events_load_error:
      "Impossible de charger vos événements.",

    my_events_count_singular:
      "1 événement",

    my_events_count_plural:
      "{count} événements",

    my_events_last_updated:
      "Dernière mise à jour",

    my_events_rejection_reason:
      "Motif du refus",

    my_events_edit:
      "Modifier l'événement",

    my_events_edit_resubmit:
      "Modifier et soumettre de nouveau",

    my_events_status_draft:
      "Brouillon",

    my_events_status_pending:
      "En attente de révision",

    my_events_status_published:
      "Publié",

    my_events_status_rejected:
      "Refusé",
    submit_new_event_tab:
      "Soumettre un nouvel événement",
    event_update_success:
      "L'événement a été mis à jour et soumis avec succès.",
    edit_event_tab:
      "Modifier l'événement",

    edit_event_heading:
      "Modifier l'événement",

    edit_event_intro:
      "Mettez à jour cet événement et soumettez les modifications pour révision.",

    save_event_changes:
      "Enregistrer les modifications",

    submit_event_heading:
      "Soumettre un événement",

    submit_event_intro:
      "Soumettez un événement pour publication dans le calendrier C et E.",

    submit_event_button:
      "Soumettre l'événement",
    event_edit_loading:
      "Chargement des renseignements sur l'événement...",
    home_hero_eyebrow:
      "Réseau canadien des communications et de l'électronique militaires",

    home_hero_title:
      "Relier la famille des C\u00A0et\u00A0E",

    home_hero_intro:
      "Un lieu commun pour les militaires en service, les vétérans, les familles, les associations et les organisations liés à la communauté canadienne des communications et de l'électronique.",

    home_explore_family:
      "Découvrir la famille des C et E",

    home_view_calendar:
      "Voir le calendrier",

    home_family_title:
      "La famille des C et E",

    home_branch_title:
      "La Branche",

    home_branch_text:
      "Découvrez la Branche militaire, son identité, sa direction et son rôle.",

    home_association_title:
      "L'Association",

    home_association_text:
      "Joignez-vous à la communauté nationale des membres en service et des anciens membres.",

    home_foundation_title:
      "La Fondation",

    home_foundation_text:
      "Découvrez comment la Fondation soutient l'éducation, la commémoration et les initiatives communautaires.",

    home_museum_title:
      "Le Musée",

    home_museum_text:
      "Découvrez les personnes, l'équipement et les récits qui ont façonné l'histoire des communications militaires canadiennes.",

    home_learn_more:
      "En savoir plus",

    home_events_eyebrow:
      "Se rassembler",

    home_events_title:
      "Événements à venir",

    home_events_intro:
      "Trouvez des retrouvailles, des cérémonies, des conférences, des activités de formation et des événements communautaires partout dans la famille des C et E.",

    home_browse_events:
      "Voir tous les événements",

    home_stories_eyebrow:
      "Actualités et commémoration",

    home_stories_title:
      "Récits de la communauté",

    home_stories_intro:
      "Consultez les dernières nouvelles, les témoignages personnels, les articles historiques, les promotions et les avis commémoratifs.",

    home_read_stories:
      "Lire les nouvelles et les récits",
    retirement_submit_eyebrow:
      "Messages de retraite",

    retirement_submit_title:
      "Soumettre un message de retraite",

    retirement_submit_intro:
      "Soulignez la carrière et le service d’un membre qui prend sa retraite. Toutes les soumissions sont révisées avant leur publication.",

    retirement_retiree_heading:
      "Renseignements sur la personne retraitée",

    retirement_retiree_intro:
      "Saisissez les renseignements du membre tels qu’ils doivent apparaître dans le message publié.",

    retirement_rank:
      "Grade au moment de la retraite",

    retirement_first_name:
      "Prénom",

    retirement_last_name:
      "Nom de famille",

    retirement_trade_role:
      "Métier ou rôle",

    retirement_years_service:
      "Années de service",

    retirement_date:
      "Date de retraite",

    retirement_message_heading:
      "Message de retraite",

    retirement_message_intro:
      "Rédigez un message soulignant la carrière, le service et les contributions du membre.",

    retirement_message_language:
      "Langue du message",

    retirement_message_text:
      "Message",

    retirement_message_minimum:
      "Minimum de 100 caractères.",

    retirement_photo:
      "Photo",

    retirement_photo_hint:
      "Facultatif. Téléversez une photo à inclure avec le message de retraite.",

    retirement_photo_invalid:
      "Téléversez un fichier image.",

    retirement_photo_too_large:
      "La photo doit faire 10 Mo ou moins.",

    retirement_photo_upload_error:
      "Impossible de téléverser la photo. Veuillez réessayer.",

    retirement_submitter_heading:
      "Renseignements sur la personne qui soumet le message",

    retirement_submitter_intro:
      "Ces renseignements servent à la confirmation et à la révision. Ils ne seront pas publiés.",

    retirement_submitter_first_name:
      "Prénom",

    retirement_submitter_last_name:
      "Nom de famille",

    retirement_submitter_relationship:
      "Lien avec la personne retraitée",

    retirement_submitter_email:
      "Courriel",

    retirement_submitter_unit:
      "Unité ou organisation",

    select_option:
      "Sélectionnez une option",

    relationship_self:
      "Moi-même",
    relationship_colleague:
      "Collègue",
    relationship_family:
      "Membre de la famille",
    relationship_other:
      "Autre",
    retirement_consent:
      "Je confirme que la personne retraitée a consenti à cette publication.",
    retirement_submit_button:
      "Soumettre pour révision",
    retirement_message_too_short:
      "Le message de retraite doit contenir au moins 100 caractères.",
    retirement_consent_required:
      "Vous devez confirmer que la personne retraitée a consenti à la publication.",
    retirement_access_denied:
      "Votre compte ne vous permet pas de soumettre des messages de retraite.",
    retirement_permission_error:
      "Impossible de vérifier vos autorisations de soumission de messages de retraite.",
    retirement_submit_success:
      "Votre message de retraite a été soumis et est en attente de révision.",
    retirement_submit_error:
      "Impossible de soumettre le message de retraite. Veuillez réessayer.",
  },
};

const langToggle = document.getElementById("langToggle");
let currentLang = localStorage.getItem("lang") || "en";

function translate(key, replacements = {}, lang = currentLang) {
  let text = translations[lang]?.[key] ?? translations.en?.[key] ?? key;

  Object.entries(replacements).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value));
  });

  return text;
}

function applyLanguage(lang) {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = translate(key, {}, lang);
  });

  // For input placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = translate(key, {}, lang);
  });

  document.documentElement.setAttribute("lang", lang);
  langToggle.textContent = lang === "en" ? "FR" : "EN";
  localStorage.setItem("lang", lang);
  currentLang = lang;

  document.dispatchEvent(
    new CustomEvent('languagechange', {
      detail: { language: lang }
    })
  );
}

langToggle.addEventListener("click", () => {
  applyLanguage(currentLang === "en" ? "fr" : "en");
});

// Apply on load
applyLanguage(currentLang);
